import { beforeEach, describe, expect, it } from 'vitest';
import { botStats, deleteRecord, humanStats, loadRecords, outcome, patchRecord, putRecord, type GameRecord } from './store';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

let t = 1000;
function rec(p: Partial<GameRecord>): GameRecord {
  return {
    v: 1,
    id: `g${t}`,
    game: 'janggi',
    gameName: 'Чанги',
    mode: 'bot',
    humanColor: 'w',
    level: 3,
    levelName: 'Любитель',
    startFen: 'x',
    moves: ['a1a2'],
    result: { winner: 'w', reason: 'checkmate' },
    endedAt: t++,
    ...p,
  };
}

describe('журнал партий', () => {
  beforeEach(() => mem.clear());

  it('сохраняет, перезаписывает по id и удаляет', () => {
    putRecord(rec({ id: 'a' }));
    putRecord(rec({ id: 'b' }));
    expect(loadRecords().map((r) => r.id)).toEqual(['b', 'a']);
    putRecord(rec({ id: 'a', moves: ['a1a2', 'b1b2'] }));
    expect(loadRecords().map((r) => r.id)).toEqual(['a', 'b']);
    expect(loadRecords()[0].moves).toHaveLength(2);
    patchRecord('a', { accuracy: { w: 80 } });
    expect(loadRecords()[0].accuracy).toEqual({ w: 80 });
    deleteRecord('a');
    expect(loadRecords().map((r) => r.id)).toEqual(['b']);
  });

  it('переживает испорченное хранилище и чужие записи', () => {
    mem.set('janggi.games.v1', '{oops');
    expect(loadRecords()).toEqual([]);
    mem.set('janggi.games.v1', JSON.stringify([{ foo: 1 }, rec({ id: 'ok', game: 'makruk', gameName: 'Макрук' })]));
    expect(loadRecords().map((r) => r.game)).toEqual(['makruk']);
  });

  it('считает победы, поражения и точность', () => {
    const list = [
      rec({ result: { winner: 'w', reason: 'checkmate' }, accuracy: { w: 90, b: 50 } }),
      rec({ result: { winner: 'w', reason: 'resign' }, humanColor: 'b', level: 5, levelName: 'Сильный любитель' }),
      rec({ result: { winner: null, reason: 'repetition' }, accuracy: { w: 70 } }),
      rec({ custom: true }),
      rec({ mode: 'human', humanColor: undefined, result: { winner: 'b', reason: 'checkmate' } }),
    ];
    expect(list.map(outcome)).toEqual(['win', 'loss', 'draw', 'win', null]);
    const s = botStats(list);
    expect(s.total).toMatchObject({ games: 3, win: 1, loss: 1, draw: 1, reviewed: 2, accuracy: 80 });
    expect(s.byLevel.map((l) => [l.level, l.tally.games])).toEqual([[3, 2], [5, 1]]);
    expect(s.byColor.b.loss).toBe(1);
    expect(humanStats(list)).toEqual({ games: 1, wins: { w: 0, b: 1 }, draws: 0 });
  });
});
