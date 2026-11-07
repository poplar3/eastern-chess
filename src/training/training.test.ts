import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { colorOf, moveToUci, parseFen, parseSquare, typeOf } from '../core/rules';
import { isPass, opposite, type Move, type Variant } from '../core/types';
import { GAME_IDS, getVariant } from '../core/variants';
import { LESSONS, lessonsFor, lessonTasks } from '.';
import { levelsFor } from '../puzzles';
import type { FindTask } from './types';

/** Позиция законна: у обеих сторон есть король, и сторона, которая не ходит, не под шахом. */
function legalPosition(fen: string, v: Variant) {
  const p = v.parseFen(fen);
  expect(p.board.includes('K')).toBe(true);
  expect(p.board.includes('k')).toBe(true);
  expect(v.inCheck({ ...p, turn: opposite(p.turn) })).toBe(false);
}

/** Удовлетворяет ли ход условию задания. */
function satisfies(t: FindTask, g: Game, m: Move) {
  const probe = new Game(g.fen, g.variant);
  const h = probe.play(m);
  if (t.goal === 'mate') return probe.result()?.reason === 'checkmate';
  if (t.goal === 'check') return h.check;
  if (t.goal === 'capture') return !!h.captured;
  return (t.moves ?? []).includes(g.variant.moveToUci(m));
}

// У макрука и шатранджа курса пока нет.
for (const id of GAME_IDS.filter((g) => lessonsFor(g).length > 0)) {
  const v = getVariant(id);
  const lessons = lessonsFor(id);
  describe(`курс обучения: ${v.name}`, () => {
    it('у уроков уникальные id и допустимые уровни', () => {
      expect(lessons.length).toBeGreaterThan(10);
      expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
      for (const l of lessons) expect(levelsFor(id).map((x) => x.n)).toContain(l.level);
    });

    it('подборки задач не пустые', () => {
      for (const l of lessons) {
        for (const t of l.tasks) {
          if (t.kind !== 'puzzles') continue;
          const before = l.tasks.indexOf(t);
          const resolved = lessonTasks({ ...l, tasks: [t] }, id);
          expect(resolved.length, `${l.id}: задание ${before} (${t.concept})`).toBeGreaterThan(0);
        }
      }
    });

    for (const lesson of lessons) {
      it(`${lesson.id}: диаграммы и задания корректны`, () => {
        for (const b of lesson.theory) if ('diagram' in b) v.parseFen(b.diagram.fen);
        for (const t of lessonTasks(lesson, id)) {
          if (t.kind === 'choice') {
            expect(t.answer).toBeGreaterThanOrEqual(0);
            expect(t.answer).toBeLessThan(t.options.length);
            if (t.fen) legalPosition(t.fen, v);
            continue;
          }
          legalPosition(t.fen, v);
          const g = new Game(t.fen, v);
          if (t.kind === 'moves') {
            const s = v.parseSquare(t.square);
            const piece = g.position.board[s];
            expect(piece, `${lesson.id}: нет фигуры на ${t.square}`).toBeTruthy();
            expect(colorOf(piece!)).toBe(g.turn);
            expect(g.legalMoves().filter((m) => m.from === s && !isPass(m)).length).toBeGreaterThan(0);
            continue;
          }
          if (t.kind === 'best') continue;
          if (t.goal === 'exact') expect(t.moves?.length).toBeGreaterThan(0);
          if (t.line) {
            for (const u of t.line) g.playUci(u);
            if (t.goal === 'mate') expect(g.result()?.reason).toBe('checkmate');
          } else {
            const ok = g.legalMoves().filter((m) => satisfies(t, g, m));
            expect(ok.length, `${lesson.id}: «${t.prompt}» — нет подходящего хода`).toBeGreaterThan(0);
            for (const u of t.moves ?? []) expect(g.legalMoves().map((m) => v.moveToUci(m))).toContain(u);
          }
        }
      });
    }
  });
}

describe('курс обучения Чанги', () => {
  it('ответы на вопросы о фигурах сходятся с правилами', () => {
    // Конь на e5 заблокирован солдатом e6: ходов на d7 и f7 нет, остальных — шесть.
    const g = new Game((LESSONS.find((l) => l.id === 'horse')!.tasks[0] as { fen: string }).fen);
    const to = g.legalMoves().filter((m) => m.from === parseSquare('e5')).map((m) => moveToUci(m).slice(2));
    expect(to.sort()).toEqual(['c4', 'c6', 'd3', 'f3', 'g4', 'g6']);
    // Слон на e5 с солдатом f7: семь ходов, без g8.
    const b = new Game((LESSONS.find((l) => l.id === 'elephant')!.tasks[0] as { fen: string }).fen);
    const bto = b.legalMoves().filter((m) => m.from === parseSquare('e5')).map((m) => moveToUci(m).slice(2));
    expect(bto).not.toContain('g8');
    expect(bto).toHaveLength(7);
    // Подсчёт очков в уроке о биджанге: у Хана больше с учётом компенсации.
    const t = LESSONS.find((l) => l.id === 'bikjang')!.tasks[0] as { fen: string };
    const p = parseFen(t.fen);
    const pts = (c: 'w' | 'b') =>
      p.board.filter((x) => x && colorOf(x) === c && typeOf(x) !== 'K').reduce((s, x) => s + { A: 3, B: 3, N: 5, R: 13, C: 7, P: 2, K: 0 }[typeOf(x!)], 0);
    expect(pts('w')).toBe(24);
    expect(pts('b')).toBe(24);
  });
});
