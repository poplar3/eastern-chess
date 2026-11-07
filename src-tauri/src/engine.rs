//! Мост к движку Fairy-Stockfish: запускает процесс, пересылает команды UCI
//! и отдаёт строки вывода во фронтенд событием `engine-line`.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

#[cfg(windows)]
const ENGINE_FILE: &str = "fairy-stockfish.exe";
#[cfg(not(any(windows, target_os = "android")))]
const ENGINE_FILE: &str = "fairy-stockfish";
/// На Android движок лежит в APK как «библиотека»: запускать файлы можно только из папки
/// нативных библиотек приложения, куда Android распаковывает их при установке.
#[cfg(target_os = "android")]
const ANDROID_ENGINE_FILE: &str = "libfairystockfish.so";

#[derive(Default)]
pub struct EngineState(Mutex<Option<EngineProcess>>);

pub struct EngineProcess {
    child: Child,
    /// Общий с потоком чтения: тот передаёт движку список сетей, как только узнаёт встроенную.
    stdin: Arc<Mutex<ChildStdin>>,
}

impl Drop for EngineProcess {
    fn drop(&mut self) {
        if let Ok(mut stdin) = self.stdin.lock() {
            let _ = stdin.write_all(b"quit\n");
        }
        let _ = self.child.kill();
    }
}

/// Разделитель файлов в опции EvalFile: на Windows в путях бывает двоеточие.
#[cfg(windows)]
const EVAL_FILE_SEP: &str = ";";
#[cfg(not(windows))]
const EVAL_FILE_SEP: &str = ":";

/// Сети NNUE остальных игр (сеть Чанги встроена в движок). Пути — относительно рабочей папки
/// движка: так они не зависят от букв в имени пользователя, которые движок на Windows не откроет.
/// Движок сам берёт сеть, имя которой начинается с названия варианта (xiangqi-….nnue для xiangqi).
struct Nets {
    dir: PathBuf,
    files: Vec<String>,
}

fn nnue_names(dir: &Path, prefix: &str, suffix: &str) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| {
            n.starts_with(prefix) && n.ends_with(suffix) && n.len() > prefix.len() + suffix.len()
        })
        .collect();
    names.sort();
    names
}

/// На ПК сети лежат в папке nnue рядом с движком.
#[cfg(not(target_os = "android"))]
fn find_nets(_app: &AppHandle, engine: &Path) -> Option<Nets> {
    let dir = engine.parent()?.to_path_buf();
    let files = nnue_names(&dir.join("nnue"), "", ".nnue")
        .into_iter()
        .map(|n| format!("nnue/{n}"))
        .collect();
    Some(Nets { dir, files })
}

/// На Android сети лежат среди библиотек как libnnue_<сеть>.so. Движок узнаёт сеть по имени,
/// поэтому в папке кеша приложения для каждой делается ссылка с настоящим именем.
#[cfg(target_os = "android")]
fn find_nets(app: &AppHandle, engine: &Path) -> Option<Nets> {
    use tauri::Manager;
    let lib = engine.parent()?;
    let dir = app.path().app_cache_dir().ok()?;
    let links = dir.join("nnue");
    let _ = std::fs::remove_dir_all(&links); // ссылки на сети прежней версии приложения
    std::fs::create_dir_all(&links).ok()?;
    let mut files = Vec::new();
    for so in nnue_names(lib, "libnnue_", ".so") {
        let name = &so["libnnue_".len()..so.len() - ".so".len()];
        let link = links.join(name);
        if std::os::unix::fs::symlink(lib.join(&so), &link).is_ok()
            || std::fs::copy(lib.join(&so), &link).is_ok()
        {
            files.push(format!("nnue/{name}"));
        }
    }
    Some(Nets { dir, files })
}

/// Папка нативных библиотек приложения — та, из которой загружена наша библиотека.
#[cfg(target_os = "android")]
fn native_lib_dir() -> Option<PathBuf> {
    let maps = std::fs::read_to_string("/proc/self/maps").ok()?;
    maps.lines()
        .filter_map(|l| l.split_whitespace().nth(5))
        .find(|p| p.ends_with("/libjanggi_lib.so"))
        .and_then(|p| PathBuf::from(p).parent().map(PathBuf::from))
}

#[cfg(target_os = "android")]
fn engine_path(_app: &AppHandle) -> Option<PathBuf> {
    Some(native_lib_dir()?.join(ANDROID_ENGINE_FILE)).filter(|p| p.is_file())
}

#[cfg(not(target_os = "android"))]
fn engine_path(app: &AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    if let Ok(p) = std::env::var("JANGGI_ENGINE") {
        return Some(PathBuf::from(p));
    }
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("engine").join(ENGINE_FILE));
    }
    // Режим разработки: файл лежит в src-tauri/engine
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("engine")
            .join(ENGINE_FILE),
    );
    candidates.into_iter().find(|p| p.is_file())
}

#[tauri::command]
pub fn engine_start(app: AppHandle, state: State<'_, EngineState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None; // перезапуск, если движок уже работал

    let path = engine_path(&app).ok_or("Файл движка Fairy-Stockfish не найден")?;
    let nets = find_nets(&app, &path);
    let mut cmd = Command::new(&path);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(n) = &nets {
        cmd.current_dir(&n.dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить движок {}: {e}", path.display()))?;
    let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("Нет stdin у движка")?));
    let stdout = child.stdout.take().ok_or("Нет stdout у движка")?;
    let extra_nets = nets.map(|n| n.files).unwrap_or_default();

    let handle = app.clone();
    let engine_in = stdin.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            // В ответ на «uci» движок называет встроенную сеть (Чанги). Список сетей надо дать вместе
            // с ней, иначе Чанги останется без нейросети. Строка приходит до uciok, то есть раньше,
            // чем интерфейс пошлёт движку настройки и выберет вариант.
            if let Ok(l) = &line
                && let Some(default) = l.strip_prefix("option name EvalFile type string default ")
                && !extra_nets.is_empty()
                && let Ok(mut w) = engine_in.lock()
            {
                let mut all = vec![default.trim().to_string()];
                all.extend(extra_nets.iter().cloned());
                let _ = writeln!(
                    w,
                    "setoption name EvalFile value {}",
                    all.join(EVAL_FILE_SEP)
                );
                let _ = w.flush();
            }
            match line {
                // Строки о текущем ходе и границах оценки интерфейсу не нужны, а каждое событие
                // на Android заметно нагружает WebView.
                Ok(l) if l.contains(" currmove ") || l.contains("bound nodes") => {}
                Ok(l) => {
                    let _ = handle.emit("engine-line", l);
                }
                Err(_) => break,
            }
        }
        let _ = handle.emit("engine-exit", ());
    });

    *guard = Some(EngineProcess { child, stdin });
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn engine_send(state: State<'_, EngineState>, line: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("Движок не запущен")?;
    let mut stdin = proc.stdin.lock().map_err(|e| e.to_string())?;
    stdin
        .write_all(format!("{line}\n").as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_stop(state: State<'_, EngineState>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
}
