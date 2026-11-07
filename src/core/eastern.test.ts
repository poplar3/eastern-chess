// Тесты необычных восточных вариаций: ок, ситтуйин, мини-сёги, киото-сёги, маньчжурские шахматы.
import { describe, expect, it } from 'vitest';
import { CAMBODIAN, CAMBODIAN_START } from './cambodian';
import { Game } from './game';
import { KYOTOSHOGI, KYOTOSHOGI_START, MINISHOGI, MINISHOGI_START } from './minishogi';
import { autoSetupMove, inSetup, SITTUYIN, SITTUYIN_START } from './sittuyin';
import type { Variant } from './types';
import { MANCHU, MANCHU_START } from './xiangqi';

const ucis = (v: Variant, fen: string) => v.legalMoves(v.parseFen(fen)).map(v.moveToUci).sort();

/**
 * Сверка с Fairy-Stockfish: файлы создаёт scripts/gen-movegen-fixtures.mjs (в CI — после сборки движка).
 * Если файла нет, проверка пропускается.
 */
const FIXTURES = import.meta.glob<[string, string][]>('./__fixtures__/fsf-movegen-*.json', { eager: true, import: 'default' });
function compareWithFsf(v: Variant) {
  const data = FIXTURES[`./__fixtures__/fsf-movegen-${v.engine}.json`] ?? null;
  it.skipIf(!data)(`генерация ходов совпадает с Fairy-Stockfish (${data?.length ?? 0} позиций)`, () => {
    const bad: string[] = [];
    for (const [fen, expected] of data!) {
      const ours = ucis(v, fen).join(' ');
      if (ours !== expected && bad.length < 3) bad.push(`${fen}\n  наши: ${ours}\n  FSF:  ${expected}`);
    }
    expect(bad.join('\n\n')).toBe('');
  });
}

describe('Ок (камбоджийские шахматы)', () => {
  it('FEN туда и обратно, права на особый ход', () => {
    expect(CAMBODIAN.toFen(CAMBODIAN.parseFen(CAMBODIAN_START))).toBe(CAMBODIAN_START);
    expect(CAMBODIAN.parseFen(CAMBODIAN_START).gates?.map(CAMBODIAN.squareName)).toEqual(['d1', 'e1', 'd8', 'e8']);
  });
  it('из начальной позиции король может прыгнуть конём', () => {
    const moves = ucis(CAMBODIAN, CAMBODIAN_START);
    expect(moves).toContain('d1b2');
    expect(moves).toContain('d1f2');
    expect(moves.length).toBe(25);
  });
  it('мет шагает на две клетки, пока не ходил', () => {
    const fen = 'rnsmksnr/8/pppppppp/8/8/PPPP1PPP/8/RNSKMSNR w DEde - 0 1';
    expect(ucis(CAMBODIAN, fen)).toContain('e1e3');
    const g = new Game(fen, CAMBODIAN);
    g.playUci('e1f2');
    g.playUci('a6a5');
    g.playUci('f2e1');
    g.playUci('a5a4');
    expect(g.legalMoves().map(CAMBODIAN.moveToUci)).not.toContain('e1e3');
    expect(g.fen.split(' ')[2]).toBe('Dde');
  });
  it('из-под шаха король не прыгает, а после хода ладьи на его линию теряет право', () => {
    expect(ucis(CAMBODIAN, '4k3/8/8/8/8/8/8/r2K4 w D - 0 1')).not.toContain('d1b2');
    const g = new Game('4k3/8/8/8/8/8/8/r2K3R b D - 0 1', CAMBODIAN);
    g.playUci('a1a8'); // ладья ушла с первой горизонтали
    expect(g.position.gates?.length).toBe(1);
    const h = new Game('4k3/8/8/7r/8/8/8/3K3R b D - 0 1', CAMBODIAN);
    h.playUci('h5d5'); // ладья встала на вертикаль короля
    expect(h.position.gates).toEqual([]);
  });
  compareWithFsf(CAMBODIAN);
});

describe('Ситтуйин', () => {
  it('FEN туда и обратно', () => {
    expect(SITTUYIN.toFen(SITTUYIN.parseFen(SITTUYIN_START))).toBe(SITTUYIN_START);
  });
  it('сначала только расстановка: колесницы — на первую горизонталь', () => {
    const moves = ucis(SITTUYIN, SITTUYIN_START);
    expect(moves.every((m) => m.includes('@'))).toBe(true);
    expect(moves.filter((m) => m.startsWith('R@')).every((m) => m.endsWith('1'))).toBe(true);
    expect(moves.length).toBe(88);
  });
  it('расстановка за игрока заканчивается за 16 ходов', () => {
    const g = new Game(undefined, SITTUYIN);
    for (let i = 0; i < 16; i++) g.play(autoSetupMove(g.position)!);
    expect(inSetup(g.position)).toBe(false);
    expect(g.legalMoves().some((m) => m.from >= 0)).toBe(true);
  });
  it('пешка превращается в генерала на диагонали, на месте или шагом', () => {
    // У белых нет генерала, пешка на d5 — на диагонали превращения.
    const fen = 'k7/8/8/3P4/8/8/P7/K7[] w - - 0 1';
    const moves = ucis(SITTUYIN, fen);
    expect(moves).toEqual(expect.arrayContaining(['d5d5f', 'd5c6f', 'd5e6f', 'd5c4f', 'd5e4f']));
    // Пешка a2 не на диагонали — не превращается.
    expect(moves.some((m) => m.startsWith('a2') && m.endsWith('f'))).toBe(false);
    const g = new Game(fen, SITTUYIN);
    g.playUci('d5d5f');
    expect(g.position.board[SITTUYIN.parseSquare('d5')]).toBe('F');
    expect(g.history[0].captured).toBeNull();
  });
  it('новый генерал не может нападать на фигуру соперника', () => {
    expect(ucis(SITTUYIN, 'k7/8/2n5/3P4/8/8/P7/K7[] w - - 0 1')).not.toContain('d5d5f');
  });
  compareWithFsf(SITTUYIN);
});

describe('Мини-сёги', () => {
  it('FEN туда и обратно и 14 ходов из начальной позиции', () => {
    const pos = MINISHOGI.parseFen(MINISHOGI_START);
    expect(MINISHOGI.toFen(pos)).toBe('rbsgk/4p/5/P4/KGSBR[] w - - 0 1');
    expect(MINISHOGI.legalMoves(pos).length).toBe(14);
  });
  it('пешка на последней горизонтали обязана превратиться', () => {
    const moves = ucis(MINISHOGI, 'k4/P4/5/5/4K[] w - - 0 1');
    expect(moves).toContain('a4a5+');
    expect(moves).not.toContain('a4a5');
  });
  it('сэннититэ без шахов — поражение сэнтэ', () => {
    const g = new Game('k4/5/5/5/4K[] w - - 0 1', MINISHOGI);
    for (let i = 0; i < 3; i++) for (const u of ['e1d1', 'a5b5', 'd1e1', 'b5a5']) g.playUci(u);
    expect(g.result()).toEqual({ winner: 'b', reason: 'repetition' });
  });
  compareWithFsf(MINISHOGI);
});

describe('Киото-сёги', () => {
  it('FEN туда и обратно', () => {
    expect(KYOTOSHOGI.toFen(KYOTOSHOGI.parseFen(KYOTOSHOGI_START))).toBe('p+nks+l/5/5/5/+LSK+NP[] w - - 0 1');
  });
  it('каждый ход, кроме хода короля, переворачивает фигуру', () => {
    const moves = ucis(KYOTOSHOGI, KYOTOSHOGI_START);
    for (const m of moves) {
      if (m.startsWith('c1')) expect(m).toMatch(/^c1[a-e]\d$/);
      else expect(m).toMatch(/[+-]$/);
    }
    const g = new Game(KYOTOSHOGI_START, KYOTOSHOGI);
    g.playUci('e1e2+'); // пешка стала ладьёй
    expect(g.position.board[KYOTOSHOGI.parseSquare('e2')]).toBe('+P');
    g.playUci('a5a4+');
    g.playUci('e2e4-'); // ладья вернулась пешкой
    expect(g.position.board[KYOTOSHOGI.parseSquare('e4')]).toBe('P');
  });
  it('взятую фигуру можно сбросить любой стороной', () => {
    const pos = KYOTOSHOGI.parseFen('k4/5/5/5/4K[S] w - - 0 1');
    const moves = KYOTOSHOGI.legalMoves(pos).map(KYOTOSHOGI.moveToUci);
    expect(moves).toContain('S@c3');
    expect(moves).toContain('+S@c3');
    const g = new Game('k4/5/5/5/4K[S] w - - 0 1', KYOTOSHOGI);
    g.playUci('+S@c3');
    expect(g.position.board[KYOTOSHOGI.parseSquare('c3')]).toBe('+S');
    expect(KYOTOSHOGI.uciToMove('+S@c3')).toEqual({ from: -1, to: KYOTOSHOGI.parseSquare('c3'), drop: 'S', promo: true });
  });
  compareWithFsf(KYOTOSHOGI);
});

describe('Маньчжурские шахматы', () => {
  it('FEN туда и обратно', () => {
    expect(MANCHU.toFen(MANCHU.parseFen(MANCHU_START))).toBe(MANCHU_START);
  });
  it('знамя ходит как колесница и конь, бьёт ещё и как пушка', () => {
    const fen = '4k4/9/9/9/4p4/9/4P4/9/9/3K1M3 w - - 0 1';
    const fromF1 = ucis(MANCHU, fen).filter((m) => m.startsWith('f1'));
    expect(fromF1).toEqual(expect.arrayContaining(['f1f10', 'f1i1', 'f1e3', 'f1g3', 'f1h2']));
    // Взятие пушкой: через пешку e4 на e6.
    const cannon = ucis(MANCHU, '4k4/9/9/9/4p4/9/4P4/9/9/3K1M3 w - - 0 1'.replace('3K1M3', '3KM4'));
    expect(cannon).toContain('e1e6');
  });
  compareWithFsf(MANCHU);
});
