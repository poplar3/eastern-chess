// Готовит Fairy-Stockfish и нейросети NNUE для всех игр приложения.
// Windows: готовая сборка из релиза Fairy-Stockfish-NNUE (janggi-9991472750de) со встроенной сетью Чанги.
// Linux: готовых сборок с нейросетью Чанги нет, поэтому движок собирается из исходников, а сеть Чанги
//        встраивается в бинарник. Нужны make, g++ и tar. FSF_SRC=<папка исходников> — собрать из уже скачанных.
// --android: то же для Android (arm64) компилятором из Android NDK (путь в ANDROID_NDK_HOME или NDK_HOME).
//        Движок кладётся в APK как библиотека libfairystockfish.so — только такие файлы Android даёт запускать.
// FAIRY_STOCKFISH=<путь> — взять готовый движок как есть.
//
// Сети остальных игр (NETS в scripts/nnue-nets.mjs) лежат отдельными файлами: на ПК — в src-tauri/engine/nnue/,
// на Android — в jniLibs под именами libnnue_<сеть>.so (Android распаковывает при установке только такие файлы).
// Движок сам выбирает сеть по началу имени файла и UCI_Variant; список файлов ему передаёт приложение
// (src-tauri/src/engine.rs). --no-nets — только движок.
// Скачанные сети хранятся в .nnue-cache/ (NNUE_CACHE=<папка> — другая папка) и проверяются по хешу из имени.
import { copyFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JANGGI, NETS } from './nnue-nets.mjs';

const JANGGI_NET = JANGGI.name;
const RELEASE = `https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/download/${JANGGI_NET.replace('.nnue', '')}`;

// Версия исходников движка (та же, что в Fairy-Stockfish-NNUE).
const FSF_COMMIT = '9f778da667f6e07dae1e85d3e2ea204fc6dee94d';
const isAndroid = process.argv.includes('--android');
const isWin = !isAndroid && (process.platform === 'win32' || process.argv.includes('--windows'));
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, isAndroid ? 'src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a' : 'src-tauri/engine');
const cache = process.env.NNUE_CACHE ?? join(root, '.nnue-cache');
const target = join(dir, isAndroid ? 'libfairystockfish.so' : isWin ? 'fairy-stockfish.exe' : 'fairy-stockfish');

async function download(url) {
  console.log(`Скачиваю ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Сеть подлинная, если первые 12 знаков SHA-256 совпадают с хешем в её имени. */
const netOk = (buf, name) => createHash('sha256').update(buf).digest('hex').startsWith(name.match(/-([0-9a-f]{12})\.nnue$/)[1]);

/** Путь к сети в кеше; скачивает её, если там нет. */
async function fetchNet(net) {
  const file = join(cache, net.name);
  if (existsSync(file) && netOk(readFileSync(file), net.name)) return file;
  mkdirSync(cache, { recursive: true });
  for (const url of net.urls) {
    try {
      const buf = await download(url);
      if (netOk(buf, net.name)) {
        writeFileSync(file, buf);
        return file;
      }
      console.warn(`${url}: файл не совпадает с ${net.name}`);
    } catch (e) {
      console.warn(`${url}: ${e.message}`);
    }
  }
  throw new Error(`Не удалось скачать сеть ${net.name}`);
}

/** Раскладывает сети остальных игр рядом с движком, убирая устаревшие. */
async function installNets() {
  const netDir = isAndroid ? dir : join(dir, 'nnue');
  const fileName = (name) => (isAndroid ? `libnnue_${name}.so` : name);
  mkdirSync(netDir, { recursive: true });
  const wanted = new Set(NETS.map((n) => fileName(n.name)));
  for (const f of readdirSync(netDir)) {
    if ((isAndroid ? /^libnnue_.*\.so$/ : /\.nnue$/).test(f) && !wanted.has(f)) rmSync(join(netDir, f));
  }
  for (const net of NETS) copyFileSync(await fetchNet(net), join(netDir, fileName(net.name)));
  console.log(`Сети: ${NETS.map((n) => n.name).join(', ')} → ${netDir}`);
}

/** Компилятор из Android NDK: make сам выбирает aarch64-linux-android21-clang++ при COMP=ndk. */
function ndkToolchain() {
  const ndk = process.env.ANDROID_NDK_HOME || process.env.NDK_HOME || process.env.ANDROID_NDK_LATEST_HOME;
  if (!ndk) throw new Error('Не найден Android NDK: укажите путь в ANDROID_NDK_HOME');
  const bin = join(ndk, 'toolchains', 'llvm', 'prebuilt', process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64', 'bin');
  if (!existsSync(bin)) throw new Error(`В NDK нет компиляторов: ${bin}`);
  return bin;
}

async function buildFromSource() {
  const work = mkdtempSync(join(tmpdir(), 'fsf-'));
  let src = process.env.FSF_SRC;
  if (src) {
    cpSync(src, join(work, 'fsf'), { recursive: true, filter: (p) => !p.endsWith('.o') });
  } else {
    writeFileSync(join(work, 'fsf.tar.gz'), await download(`https://github.com/fairy-stockfish/Fairy-Stockfish/archive/${FSF_COMMIT}.tar.gz`));
    execFileSync('tar', ['xzf', 'fsf.tar.gz'], { cwd: work });
    execFileSync('mv', [`Fairy-Stockfish-${FSF_COMMIT}`, 'fsf'], { cwd: work });
  }
  src = join(work, 'fsf', 'src');
  copyFileSync(await fetchNet(JANGGI), join(src, JANGGI_NET));
  // Сеть Чанги становится встроенной сетью по умолчанию — как в сборке для Windows.
  const h = join(src, 'evaluate.h');
  writeFileSync(h, readFileSync(h, 'utf8').replace(/(#define EvalFileDefaultName\s+)"[^"]+"/, `$1"${JANGGI_NET}"`));
  // load_net= — не скачивать стандартную шахматную сеть: нужная уже лежит рядом.
  console.log('Собираю Fairy-Stockfish…');
  const args = ['-j', String(availableParallelism()), 'build', 'largeboards=yes', 'nnue=yes', 'load_net='];
  let env = process.env;
  if (isAndroid) {
    const bin = ndkToolchain();
    args.push('ARCH=armv8', 'COMP=ndk');
    env = { ...env, PATH: `${bin}:${env.PATH}` };
    execFileSync('make', args, { cwd: src, env, stdio: ['ignore', 'ignore', 'inherit'] });
    execFileSync(join(bin, 'llvm-strip'), ['stockfish'], { cwd: src });
  } else {
    args.push('ARCH=x86-64-modern');
    execFileSync('make', args, { cwd: src, env, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  copyFileSync(join(src, 'stockfish'), target);
}

mkdirSync(dir, { recursive: true });
if (!isAndroid) copyFileSync(join(root, 'LICENSE'), join(dir, 'COPYING.txt'));
if (process.env.FAIRY_STOCKFISH) {
  copyFileSync(process.env.FAIRY_STOCKFISH, target);
} else if (isWin) {
  writeFileSync(target, await download(`${RELEASE}/fairy-stockfish_x86-64-modern.exe`));
} else if (!existsSync(target) || process.argv.includes('--rebuild')) {
  await buildFromSource();
}
if (!isWin) chmodSync(target, 0o755);
if (!process.argv.includes('--no-nets')) await installNets();
console.log(`Движок: ${target}`);
