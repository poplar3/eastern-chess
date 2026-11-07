// Журнал завершённых партий и статистика по нему.
// Записи хранятся в localStorage (на ПК и на Android одинаково). Формат намеренно не привязан
// к списку игр в коде: поле `game` — строка, а названия игры и уровня бота сохраняются в записи,
// чтобы партии новых или убранных игр не терялись и показывались даже без поддержки в этой версии.
import type { Color, EndReason } from '../core/types';

export interface GameRecord {
  /** Версия формата записи. */
  v: 1;
  id: string;
  /** Игра: id варианта ('janggi', 'xiangqi', 'shogi', в будущем и другие). */
  game: string;
  /** Название игры на момент партии — на случай, если такой игры в приложении больше нет. */
  gameName: string;
  mode: 'bot' | 'human';
  /** За кого играл человек (в партии с ботом). */
  humanColor?: Color;
  /** Уровень бота: номер и название на момент партии. */
  level?: number;
  levelName?: string;
  /** Партия начата не с обычной начальной позиции (из задачи или произвольной позиции). */
  custom?: boolean;
  /** Расстановки Чо и Хана (Чанги). */
  setups?: { w: string; b: string };
  startFen: string;
  /** Ходы в записи движка (UCI). */
  moves: string[];
  result: { winner: Color | null; reason: EndReason | string };
  /** Время окончания, мс с 1970 года. */
  endedAt: number;
  /** Точность сторон по разбору, 0…100. */
  accuracy?: Partial<Record<Color, number>>;
  /** Глубина разбора, по которой посчитана точность (0 — оценка ходов во время игры). */
  accuracyDepth?: number;
}

const KEY = 'janggi.games.v1';
/** Сколько последних партий храним. */
export const MAX_RECORDS = 1000;

export function newRecordId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(x: unknown): x is GameRecord {
  const r = x as GameRecord;
  return !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.game === 'string' && Array.isArray(r.moves) && !!r.result;
}

/** Все сохранённые партии, новые первыми. */
export function loadRecords(): GameRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isRecord).sort((a, b) => b.endedAt - a.endedAt) : [];
  } catch {
    return [];
  }
}

function saveRecords(list: GameRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECORDS)));
  } catch {
    // хранилище недоступно — журнал просто не сохранится
  }
}

/** Добавляет запись или заменяет запись с тем же id. */
export function putRecord(r: GameRecord) {
  const list = loadRecords().filter((x) => x.id !== r.id);
  list.unshift(r);
  list.sort((a, b) => b.endedAt - a.endedAt);
  saveRecords(list);
}

/** Обновляет поля записи, если она есть. */
export function patchRecord(id: string, patch: Partial<GameRecord>) {
  const list = loadRecords();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch, id };
  saveRecords(list);
}

export function deleteRecord(id: string) {
  saveRecords(loadRecords().filter((x) => x.id !== id));
}

/** Итог партии с точки зрения человека (для партий с ботом). */
export function outcome(r: GameRecord): 'win' | 'loss' | 'draw' | null {
  if (r.mode !== 'bot' || !r.humanColor) return null;
  if (r.result.winner === null) return 'draw';
  return r.result.winner === r.humanColor ? 'win' : 'loss';
}

export interface Tally {
  games: number;
  win: number;
  loss: number;
  draw: number;
  /** Средняя точность человека по разобранным партиям. */
  accuracy: number | null;
  reviewed: number;
}

const emptyTally = (): Tally => ({ games: 0, win: 0, loss: 0, draw: 0, accuracy: null, reviewed: 0 });

function addTo(t: Tally, r: GameRecord) {
  t.games++;
  const o = outcome(r);
  if (o) t[o]++;
  const a = r.humanColor ? r.accuracy?.[r.humanColor] : undefined;
  if (typeof a === 'number') {
    t.accuracy = ((t.accuracy ?? 0) * t.reviewed + a) / (t.reviewed + 1);
    t.reviewed++;
  }
}

export interface BotStats {
  total: Tally;
  /** По уровням бота, по возрастанию. */
  byLevel: { level: number; name: string; tally: Tally }[];
  /** По цвету человека. */
  byColor: Record<Color, Tally>;
}

/**
 * Статистика партий с ботом. Партии, начатые с произвольной позиции (из задач),
 * в счёт не идут: там исход зависит от позиции, а не от силы игры.
 */
export function botStats(records: GameRecord[]): BotStats {
  const total = emptyTally();
  const byColor: Record<Color, Tally> = { w: emptyTally(), b: emptyTally() };
  const levels = new Map<number, { level: number; name: string; tally: Tally }>();
  for (const r of records) {
    if (r.mode !== 'bot' || r.custom || !r.humanColor) continue;
    addTo(total, r);
    addTo(byColor[r.humanColor], r);
    const lv = r.level ?? 0;
    if (!levels.has(lv)) levels.set(lv, { level: lv, name: r.levelName ?? `Уровень ${lv}`, tally: emptyTally() });
    addTo(levels.get(lv)!.tally, r);
  }
  return { total, byColor, byLevel: [...levels.values()].sort((a, b) => a.level - b.level) };
}

export interface HumanStats {
  games: number;
  wins: Record<Color, number>;
  draws: number;
}

/** Партии двух игроков за одним устройством: кто сколько выиграл. */
export function humanStats(records: GameRecord[]): HumanStats {
  const s: HumanStats = { games: 0, wins: { w: 0, b: 0 }, draws: 0 };
  for (const r of records) {
    if (r.mode !== 'human') continue;
    s.games++;
    if (r.result.winner) s.wins[r.result.winner]++;
    else s.draws++;
  }
  return s;
}
