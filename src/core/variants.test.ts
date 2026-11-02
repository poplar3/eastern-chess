import { describe, expect, it } from 'vitest';
import shogiFixtures from './__fixtures__/fsf-movegen-shogi.json';
import xiangqiFixtures from './__fixtures__/fsf-movegen-xiangqi.json';
import { Game } from './game';
import { SHOGI, SHOGI_START } from './shogi';
import type { Variant } from './types';
import { XIANGQI, XIANGQI_START } from './xiangqi';

function compare(v: Variant, data: [string, string][]) {
  let mismatches = 0;
  const examples: string[] = [];
  for (const [fen, expected] of data) {
    const ours = v.legalMoves(v.parseFen(fen)).map(v.moveToUci).sort().join(' ');
    if (ours !== expected) {
      mismatches++;
      if (examples.length < 3) examples.push(`${fen}\n  наши: ${ours}\n  FSF:  ${expected}`);
    }
  }
  expect(examples.join('\n\n')).toBe('');
  expect(mismatches).toBe(0);
}

describe('Сянци', () => {
  it('FEN туда и обратно', () => {
    expect(XIANGQI.toFen(XIANGQI.parseFen(XIANGQI_START))).toBe(XIANGQI_START);
  });
  it(`генерация ходов совпадает с Fairy-Stockfish на ${xiangqiFixtures.length} позициях`, () => {
    compare(XIANGQI, xiangqiFixtures as [string, string][]);
  });
  it('мат двумя колесницами', () => {
    const g = new Game('3k5/R8/9/9/9/9/9/9/9/4K3R w - - 0 1', XIANGQI);
    g.playUci('i1i10');
    expect(g.result()).toEqual({ winner: 'w', reason: 'checkmate' });
  });
  it('летающий генерал: нельзя открыть вертикаль между генералами', () => {
    const pos = XIANGQI.parseFen('4k4/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1');
    const moves = XIANGQI.legalMoves(pos).map(XIANGQI.moveToUci);
    expect(moves).not.toContain('e2d2');
    expect(moves).toContain('e2e9');
  });
  it('пат — поражение', () => {
    // Чёрный генерал на d10 зажат: d9 и e10 бьют колесницы, других фигур нет.
    const g = new Game('3k5/9/9/9/9/9/9/9/2R6/4K4 w - - 0 1', XIANGQI);
    g.playUci('c2c9');
    // теперь ход чёрных: генерал может пойти только на e10 — под удар генерала через вертикаль e
    expect(g.result()?.winner).toBe('w');
  });
  it('троекратное повторение без шахов — ничья', () => {
    const g = new Game('3k5/9/9/9/9/9/9/9/R8/4K4 w - - 0 1', XIANGQI);
    for (let i = 0; i < 2; i++) for (const u of ['a2a3', 'd10d9', 'a3a2', 'd9d10']) g.playUci(u);
    expect(g.result()).toEqual({ winner: null, reason: 'repetition' });
  });
});

describe('Сёги', () => {
  it('FEN туда и обратно, с фигурами в руке и превращёнными', () => {
    expect(SHOGI.toFen(SHOGI.parseFen(SHOGI_START))).toBe(SHOGI_START);
    const fen = 'lnsgk2nl/1r4gs1/p1pp+Pp1pp/1p4p2/7P1/2P6/PP1P1PP1P/1SG4R1/LN2KGSNL[BPbp] w - - 0 1';
    expect(SHOGI.toFen(SHOGI.parseFen(fen))).toBe(fen);
    expect(SHOGI.parseFen('4k4/9/9/9/9/9/9/9/4K4[-] w 0 1').hands).toEqual({ w: {}, b: {} });
  });
  it(`генерация ходов совпадает с Fairy-Stockfish на ${shogiFixtures.length} позициях`, () => {
    compare(SHOGI, shogiFixtures as [string, string][]);
  });
  it('запись ходов и полей', () => {
    expect(SHOGI.squareName(SHOGI.parseSquare('c3'))).toBe('7g');
    expect(SHOGI.squareName(SHOGI.parseSquare('e1'))).toBe('5i');
    const g = new Game(undefined, SHOGI);
    expect(SHOGI.formatMove(g.playUci('c3c4'))).toBe('П 7g–7f');
  });
  it('взятая фигура уходит в руку и сбрасывается', () => {
    const g = new Game('4k4/9/9/9/4p4/4R4/9/9/4K4[] w - - 0 1', SHOGI);
    g.playUci('e4e5');
    expect(g.position.hands?.w).toEqual({ P: 1 });
    g.playUci('e9d9');
    expect(g.legalMoves().some((m) => m.drop === 'P')).toBe(true);
    const h = g.playUci('P@d8');
    expect(SHOGI.formatMove(h)).toBe('П*6b');
  });
  it('мат сбросом пешки проигрывает поставившему', () => {
    // Король готэ на a9 зажат своими фигурами; пешка на a8 даёт мат (её защищает золото на b7).
    const g = new Game('kn7/1s7/1G7/9/9/9/9/9/4K4[P] w - - 0 1', SHOGI);
    g.playUci('P@a8');
    expect(g.result()).toEqual({ winner: 'b', reason: 'pawn-drop-mate' });
    const g2 = new Game('kn7/1s7/1G7/9/9/9/9/9/4K4[P] w - - 0 1', SHOGI);
    g2.playUci('b7b8');
    expect(g2.result()).toBeNull();
  });
  it('четырёхкратное повторение — ничья', () => {
    const g = new Game('4k4/9/9/9/9/9/9/9/R3K4[] w - - 0 1', SHOGI);
    for (let i = 0; i < 3; i++) for (const u of ['a1a2', 'e9d9', 'a2a1', 'd9e9']) g.playUci(u);
    expect(g.result()).toEqual({ winner: null, reason: 'repetition' });
  });
});
