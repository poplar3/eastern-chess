// Нейросети NNUE для движка: одна на игру. Движок выбирает сеть по началу имени файла и UCI_Variant.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const NNUE_REPO = 'https://raw.githubusercontent.com/fairy-stockfish/Fairy-Stockfish-NNUE/master';
const drive = (id) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

/** Сеть Чанги встроена в сам движок (EvalFile по умолчанию). */
export const JANGGI = { name: 'janggi-9991472750de.nnue', urls: [`${NNUE_REPO}/janggi-9991472750de.nnue`, drive('1dAEzbK1rOm8UGm_-CLdDEgeopFDcAtQP')] };

/**
 * Сети остальных игр — лучшие по списку https://fairy-stockfish.github.io/nnue/ (прирост в Elo — против
 * классической оценки по тому же списку). Сеть подходит и вариантам с тем же nnueAlias: makruk — для cambodian.
 * Чтобы добавить игру, впишите сюда её сеть: приложение передаст движку все сети из папки.
 */
export const NETS = [
  // Сеть разработчиков Pikafish, +914 Elo.
  { name: 'xiangqi-c07e94a5c7cb.nnue', urls: [`${NNUE_REPO}/xiangqi-c07e94a5c7cb.nnue`, drive('18-zDt7z4H9_IQVvcWIvndnKjC5LZhAfm')] },
  // Fabian Fichter, более +1000 Elo.
  { name: 'shogi-9ab5e57f31d0.nnue', urls: [drive('1fRMEmhA0xfEpkT7LuJciJqx-C_t_EleU')] },
  // +248 Elo; подходит и для cambodian.
  { name: 'makruk-a8c621e24a8c.nnue', urls: [`${NNUE_REPO}/makruk-a8c621e24a8c.nnue`, drive('1jOhdVe1VBZjBaPWO2IYR1_iscyMA0ylW')] },
  // +400 Elo.
  { name: 'shatranj-09bfa52e776f.nnue', urls: [drive('17qL4MFJxThnn8qnHhsUUzX5sr8RzWNY-')] },
];

/**
 * Значение опции EvalFile для движка из src-tauri/engine: встроенная сеть Чанги и все сети из папки nnue
 * рядом с движком (их кладёт scripts/fetch-engine.mjs). Пустая строка — папки нет, работает только Чанги.
 */
export function evalFileFor(enginePath) {
  const dir = resolve(dirname(enginePath), 'nnue');
  if (!existsSync(dir)) return '';
  const nets = readdirSync(dir).filter((f) => f.endsWith('.nnue')).map((f) => join(dir, f));
  return nets.length ? [JANGGI.name, ...nets].join(process.platform === 'win32' ? ';' : ':') : '';
}
