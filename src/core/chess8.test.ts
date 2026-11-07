import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { MAKRUK, MAKRUK_START } from './makruk';
import { SHATRANJ, SHATRANJ_START } from './shatranj';
import type { Position, Variant } from './types';

function perft(v: Variant, pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = v.legalMoves(pos);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + perft(v, v.makeMove(pos, m), depth - 1), 0);
}

const uciMoves = (v: Variant, fen: string) => v.legalMoves(v.parseFen(fen)).map(v.moveToUci).sort();

/**
 * Сверка с Fairy-Stockfish: файлы создаёт scripts/gen-movegen-fixtures.mjs (в CI — после сборки движка).
 * Если файла нет, проверка пропускается.
 */
const FIXTURES = import.meta.glob<[string, string][]>(['./__fixtures__/fsf-movegen-makruk.json', './__fixtures__/fsf-movegen-shatranj.json'], { eager: true, import: 'default' });
function fsfFixtures(name: string): [string, string][] | null {
  return FIXTURES[`./__fixtures__/fsf-movegen-${name}.json`] ?? null;
}

function compareWithFsf(v: Variant) {
  const data = fsfFixtures(v.engine);
  it.skipIf(!data)(`генерация ходов совпадает с Fairy-Stockfish (${data?.length ?? 0} позиций)`, () => {
    const bad: string[] = [];
    for (const [fen, expected] of data!) {
      const ours = uciMoves(v, fen).join(' ');
      if (ours !== expected && bad.length < 3) bad.push(`${fen}\n  наши: ${ours}\n  FSF:  ${expected}`);
    }
    expect(bad.join('\n\n')).toBe('');
  });
}

describe('Макрук', () => {
  it('FEN туда и обратно', () => {
    expect(MAKRUK.toFen(MAKRUK.parseFen(MAKRUK_START))).toBe(MAKRUK_START);
    // Пометку превращённой пешки «~» из Fairy-Stockfish понимаем.
    expect(MAKRUK.parseFen('4k3/8/8/8/8/8/M~7/4K3 w - - 0 1').board[8]).toBe('M');
  });
  it('число ходов из начальной позиции', () => {
    const start = MAKRUK.parseFen(MAKRUK_START);
    expect(perft(MAKRUK, start, 1)).toBe(23);
    expect(perft(MAKRUK, start, 2)).toBe(529);
  });
  it('кхон ходит на пять полей, мет — на четыре', () => {
    expect(uciMoves(MAKRUK, 'k7/8/8/8/3S4/8/8/7K w - - 0 1').filter((m) => m.startsWith('d4'))).toEqual(['d4c3', 'd4c5', 'd4d5', 'd4e3', 'd4e5']);
    expect(uciMoves(MAKRUK, 'k7/8/8/8/3M4/8/8/7K w - - 0 1').filter((m) => m.startsWith('d4'))).toEqual(['d4c3', 'd4c5', 'd4e3', 'd4e5']);
    // Чёрный кхон идёт «вперёд» вниз.
    expect(uciMoves(MAKRUK, 'K7/8/8/8/3s4/8/8/7k b - - 0 1').filter((m) => m.startsWith('d4'))).toEqual(['d4c3', 'd4c5', 'd4d3', 'd4e3', 'd4e5']);
  });
  it('пешка превращается в мета на шестой горизонтали', () => {
    const g = new Game('k7/8/8/P7/8/8/8/7K w - - 0 1', MAKRUK);
    expect(g.legalMoves().map(MAKRUK.moveToUci)).toContain('a5a6m');
    g.playUci('a5a6'); // движок может прислать ход и без буквы фигуры
    expect(g.position.board[MAKRUK.parseSquare('a6')]).toBe('M');
    expect(MAKRUK.formatMove(g.history[0])).toBe('П a5–a6=М');
  });
  it('пат — ничья', () => {
    const g = new Game('k7/2K5/1M6/8/8/8/8/8 b - - 0 1', MAKRUK);
    expect(g.result()).toEqual({ winner: null, reason: 'stalemate' });
  });
  it('мат ладьёй', () => {
    const g = new Game('k7/8/1K6/8/8/8/8/7R w - - 0 1', MAKRUK);
    g.playUci('h1h8');
    expect(g.result()).toEqual({ winner: 'w', reason: 'checkmate' });
  });
  it('правило счёта: с одной ладьёй против короля — 16 ходов', () => {
    const g = new Game('7k/8/8/8/8/8/R7/K7 w - - 0 1', MAKRUK);
    expect(MAKRUK.countingText!(g.start, g.history)).toBe('У чёрных остался один король: счёт 0 из 16 ходов до ничьей');
    const white = ['a2b2', 'b2c2', 'c2d2', 'd2e2', 'e2f2', 'f2g2', 'g2h2', 'h2h3', 'h3g3', 'g3f3', 'f3e3', 'e3d3', 'd3c3', 'c3b3', 'b3a3', 'a3a4'];
    const black = ['h8g8', 'g8f8', 'f8e8', 'e8d8', 'd8c8', 'c8b8', 'b8a8', 'a8a7', 'a7b7', 'b7c7', 'c7d7', 'd7e7', 'e7f7', 'f7g7', 'g7h7', 'h7g7'];
    for (let i = 0; i < 16; i++) {
      expect(g.result()).toBeNull();
      g.playUci(white[i]);
      expect(g.result()).toBeNull();
      g.playUci(black[i]);
    }
    expect(g.result()).toEqual({ winner: null, reason: 'counting' });
  });
  it('одни короли — ничья', () => {
    const g = new Game('k7/8/8/8/8/8/1r6/K7 w - - 0 1', MAKRUK);
    g.playUci('a1b2');
    expect(g.result()).toEqual({ winner: null, reason: 'insufficient' });
  });
  compareWithFsf(MAKRUK);
});

describe('Шатрандж', () => {
  it('FEN туда и обратно', () => {
    expect(SHATRANJ.toFen(SHATRANJ.parseFen(SHATRANJ_START))).toBe(SHATRANJ_START);
  });
  it('число ходов из начальной позиции', () => {
    const start = SHATRANJ.parseFen(SHATRANJ_START);
    expect(perft(SHATRANJ, start, 1)).toBe(16);
    expect(perft(SHATRANJ, start, 2)).toBe(256);
  });
  it('слон прыгает через фигуру на две клетки по диагонали, ферзь — шаг по диагонали', () => {
    const moves = uciMoves(SHATRANJ, SHATRANJ_START);
    expect(moves.filter((m) => m.startsWith('c1'))).toEqual(['c1a3', 'c1e3']);
    expect(moves.filter((m) => m.startsWith('e1'))).toEqual([]);
    expect(uciMoves(SHATRANJ, 'k7/8/8/8/3Q4/8/8/7K w - - 0 1').filter((m) => m.startsWith('d4'))).toEqual(['d4c3', 'd4c5', 'd4e3', 'd4e5']);
  });
  it('пешка превращается в ферзя на последней горизонтали', () => {
    const g = new Game('k7/6P1/8/8/8/8/p7/K7 w - - 0 1', SHATRANJ);
    g.playUci('g7g8q');
    expect(g.position.board[SHATRANJ.parseSquare('g8')]).toBe('Q');
  });
  it('пат — поражение запатованного', () => {
    const g = new Game('k7/2K5/1Q6/8/8/8/8/8 b - - 0 1', SHATRANJ);
    expect(g.result()).toEqual({ winner: 'w', reason: 'stalemate' });
  });
  it('оголённый король проигрывает', () => {
    const g = new Game('k7/8/8/8/8/8/p7/RK6 w - - 0 1', SHATRANJ);
    g.playUci('a1a2');
    expect(g.result()).toEqual({ winner: 'w', reason: 'bare-king' });
  });
  it('но если можно сразу забрать последнюю фигуру соперника — игра продолжается и кончается ничьей', () => {
    const g = new Game('4r2k/8/8/4N3/3K4/8/8/8 b - - 0 1', SHATRANJ);
    g.playUci('e8e5');
    expect(g.result()).toBeNull();
    g.playUci('d4e5');
    expect(g.result()).toEqual({ winner: null, reason: 'insufficient' });
    // Ладья под защитой короля — взять нельзя, белые проигрывают.
    const g3 = new Game('4r3/8/5k2/4N3/3K4/8/8/8 b - - 0 1', SHATRANJ);
    g3.playUci('e8e5');
    expect(g3.result()).toEqual({ winner: 'b', reason: 'bare-king' });
  });
  compareWithFsf(SHATRANJ);
});
