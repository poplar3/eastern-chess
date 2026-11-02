import bakbo from './bakbo.json';
import classic from './classic.json';
import own from './own.json';
import shogi from './shogi.json';
import xiangqi from './xiangqi.json';
import type { GameId } from '../core/types';
import { getVariant } from '../core/variants';
import { annotate, type Puzzle, type PuzzleData } from './annotate';

export { LEVELS, levelsFor, type Puzzle } from './annotate';
export { CONCEPTS, conceptsFor, type ConceptId } from './concepts';

const OWN_SOURCE = {
  game: { author: 'Задачи приложения', title: 'Позиция из партии Fairy-Stockfish, решение проверено движком на единственность' },
  compose: { author: 'Задачи приложения', title: 'Позиция с небольшим числом фигур, составленная с помощью Fairy-Stockfish; решение проверено движком на единственность' },
  bakbo: { author: 'Задачи приложения', title: 'Составлена с помощью Fairy-Stockfish по правилам 박보 (каждый ход решающего — шах); решение проверено движком на единственность' },
};

/** Задача взята из корейского источника, а не составлена приложением. */
export const isClassic = (p: PuzzleData) => p.id.startsWith('classic-');

const OTHER_SOURCE: Record<string, { author: string; title: string }> = {
  game: OWN_SOURCE.game,
  compose: OWN_SOURCE.compose,
  checks: { author: 'Задачи приложения', title: 'Составлена с помощью Fairy-Stockfish: каждый ход решающего — шах; решение проверено движком на единственность' },
};

const cache: Partial<Record<GameId, Puzzle[]>> = {};

const sortPuzzles = (list: Puzzle[]) =>
  list.sort((a, b) => a.level.n - b.level.n || (a.mateIn ?? 9) - (b.mateIn ?? 9) || a.line.length - b.line.length || a.id.localeCompare(b.id));

/** Все задачи игры, от простых к сложным. */
export function allPuzzles(game: GameId = 'janggi'): Puzzle[] {
  const hit = cache[game];
  if (hit) return hit;
  if (game !== 'janggi') {
    const v = getVariant(game);
    const raw = (game === 'xiangqi' ? xiangqi : shogi) as (PuzzleData & { origin: string })[];
    return (cache[game] = sortPuzzles(raw.map(({ origin, ...d }) => annotate({ ...d, source: OTHER_SOURCE[origin] ?? OWN_SOURCE.game }, v))));
  }
  const data = [...own, ...bakbo, ...classic] as (PuzzleData & { origin: keyof typeof OWN_SOURCE | 'classic' })[];
  // Задачи из корейских источников несут ссылку на источник сами, остальные составлены приложением.
  const raw: PuzzleData[] = data.map(({ origin, ...d }) => ({
    ...d,
    source: origin === 'classic' ? d.source : OWN_SOURCE[origin],
  }));
  return (cache.janggi = sortPuzzles(raw.map((d) => annotate(d))));
}

const KEY = 'janggi.puzzles.solved';

/** Решённые задачи: id → решена без ошибок и подсказок. */
export function loadSolved(): Record<string, { clean: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveSolved(s: Record<string, { clean: boolean }>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // хранилище недоступно — прогресс просто не сохранится
  }
}
