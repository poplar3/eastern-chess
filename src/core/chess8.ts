// Общая основа для игр на доске 8×8 в клетках: Макрук (тайские шахматы) и Шатрандж (старинные персидские).
// Фигуры записываются буквами Fairy-Stockfish: в макруке S — кхон, M — мет; в шатрандже Q — ферзь, B — слон (альфиль).
// Рокировки и двойного хода пешки нет; пешка, дойдя до зоны превращения, обязательно превращается.
import {
  colorOf,
  opposite,
  repetitionCount,
  typeOf,
  type Board,
  type Color,
  type GameResult,
  type HistoryEntry,
  type Move,
  type Piece,
  type PieceInfo,
  type Position,
} from './types';

export const SIZE = 8;
export const FILE_LETTERS = 'abcdefgh';

export const sq = (f: number, r: number) => r * SIZE + f;
export const fileOf = (s: number) => s % SIZE;
export const rankOf = (s: number) => Math.floor(s / SIZE);
const onBoard = (f: number, r: number) => f >= 0 && f < SIZE && r >= 0 && r < SIZE;

export function squareName(s: number) {
  return FILE_LETTERS[fileOf(s)] + (rankOf(s) + 1);
}
export function parseSquare(name: string) {
  const f = FILE_LETTERS.indexOf(name[0]);
  const r = parseInt(name.slice(1), 10) - 1;
  if (f < 0 || !(r >= 0 && r < SIZE)) throw new Error(`Неверное поле: ${name}`);
  return sq(f, r);
}

/** Как ходит фигура. */
export type Gait = 'king' | 'fers' | 'khon' | 'alfil' | 'knight' | 'rook' | 'pawn';

export interface Chess8Rules {
  /** Тип фигуры (заглавная буква) → как она ходит. */
  gaits: Record<string, Gait>;
  /** Горизонталь превращения пешки первой стороны (0 — первая); у второй — зеркально. */
  promoRank: number;
  /** Во что превращается пешка. */
  promoTo: string;
  pieces: Record<string, PieceInfo>;
}

// ---------- FEN ----------

export function makeFen(rules: Chess8Rules) {
  function parseFen(fen: string): Position {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    if (rows.length !== SIZE) throw new Error('FEN: должно быть 8 рядов');
    const board: Board = new Array(SIZE * SIZE).fill(null);
    rows.forEach((row, i) => {
      const rank = SIZE - 1 - i;
      let file = 0;
      // «~» после буквы — пометка Fairy-Stockfish о превращённой пешке: для правил она не важна.
      const re = /(\d+)|([a-zA-Z])~?/g;
      let t: RegExpExecArray | null;
      while ((t = re.exec(row))) {
        if (t[1]) file += parseInt(t[1], 10);
        else {
          if (!rules.gaits[typeOf(t[2])]) throw new Error(`FEN: неизвестная фигура ${t[2]}`);
          if (file < SIZE) board[sq(file, rank)] = t[2];
          file++;
        }
      }
      if (file !== SIZE) throw new Error(`FEN: ряд ${rank + 1} неполный`);
    });
    const turn: Color = parts[1] === 'b' ? 'b' : 'w';
    const nums = parts.slice(2).filter((x) => /^\d+$/.test(x));
    const half = nums.length >= 2 ? parseInt(nums[nums.length - 2], 10) : 0;
    const full = nums.length >= 1 ? parseInt(nums[nums.length - 1], 10) : 1;
    return { board, turn, halfmove: half || 0, fullmove: full || 1 };
  }

  function toFen(pos: Position): string {
    const rows: string[] = [];
    for (let r = SIZE - 1; r >= 0; r--) {
      let row = '';
      let empty = 0;
      for (let f = 0; f < SIZE; f++) {
        const p = pos.board[sq(f, r)];
        if (!p) empty++;
        else {
          if (empty) row += empty;
          empty = 0;
          row += p;
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return `${rows.join('/')} ${pos.turn} - - ${pos.halfmove} ${pos.fullmove}`;
  }

  return { parseFen, toFen };
}

// ---------- Ходы ----------

const KING: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KNIGHT: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const ALFIL: [number, number][] = [[2, 2], [2, -2], [-2, 2], [-2, -2]];

export function makeMoves(rules: Chess8Rules) {
  const promoRankOf = (c: Color) => (c === 'w' ? rules.promoRank : SIZE - 1 - rules.promoRank);

  /** Поля, куда фигура может пойти или где бьёт (без учёта шаха своему королю). */
  function targets(board: Board, from: number): number[] {
    const p = board[from]!;
    const us = colorOf(p);
    const fwd = us === 'w' ? 1 : -1;
    const f0 = fileOf(from), r0 = rankOf(from);
    const out: number[] = [];
    const leap = (steps: [number, number][]) => {
      for (const [df, dr] of steps) {
        const f = f0 + df, r = r0 + dr;
        if (!onBoard(f, r)) continue;
        const t = board[sq(f, r)];
        if (!t || colorOf(t) !== us) out.push(sq(f, r));
      }
    };
    switch (rules.gaits[typeOf(p)]) {
      case 'king':
        leap(KING);
        break;
      case 'fers':
        leap(DIAG);
        break;
      case 'khon':
        leap([...DIAG, [0, fwd]]);
        break;
      case 'alfil':
        leap(ALFIL);
        break;
      case 'knight':
        leap(KNIGHT);
        break;
      case 'rook':
        for (const [df, dr] of ORTHO) {
          let f = f0 + df, r = r0 + dr;
          while (onBoard(f, r)) {
            const t = board[sq(f, r)];
            if (t) {
              if (colorOf(t) !== us) out.push(sq(f, r));
              break;
            }
            out.push(sq(f, r));
            f += df;
            r += dr;
          }
        }
        break;
      case 'pawn': {
        const r = r0 + fwd;
        if (r < 0 || r >= SIZE) break;
        if (!board[sq(f0, r)]) out.push(sq(f0, r));
        for (const df of [-1, 1]) {
          const f = f0 + df;
          if (!onBoard(f, r)) continue;
          const t = board[sq(f, r)];
          if (t && colorOf(t) !== us) out.push(sq(f, r));
        }
        break;
      }
    }
    return out;
  }

  /** Поля, которые бьёт фигура: пешка бьёт только по диагонали вперёд. */
  function attacksFrom(board: Board, from: number): number[] {
    const p = board[from];
    if (!p) return [];
    if (rules.gaits[typeOf(p)] !== 'pawn') return targets(board, from);
    const fwd = colorOf(p) === 'w' ? 1 : -1;
    const r = rankOf(from) + fwd;
    return [-1, 1].map((df) => fileOf(from) + df).filter((f) => onBoard(f, r)).map((f) => sq(f, r));
  }

  const findKing = (board: Board, c: Color) => board.indexOf(c === 'w' ? 'K' : 'k');

  function isAttacked(board: Board, target: number, by: Color) {
    for (let s = 0; s < board.length; s++) {
      const p = board[s];
      if (p && colorOf(p) === by && attacksFrom(board, s).includes(target)) return true;
    }
    return false;
  }

  function kingInCheck(board: Board, c: Color) {
    const k = findKing(board, c);
    return k >= 0 && isAttacked(board, k, opposite(c));
  }

  function apply(board: Board, m: Move): Board {
    const next = board.slice();
    const p = next[m.from]!;
    next[m.to] = m.promo ? (colorOf(p) === 'w' ? rules.promoTo : rules.promoTo.toLowerCase()) : p;
    next[m.from] = null;
    return next;
  }

  function legalMoves(pos: Position): Move[] {
    const out: Move[] = [];
    for (let s = 0; s < pos.board.length; s++) {
      const p = pos.board[s];
      if (!p || colorOf(p) !== pos.turn) continue;
      const pawn = rules.gaits[typeOf(p)] === 'pawn';
      for (const to of targets(pos.board, s)) {
        const m: Move = pawn && rankOf(to) === promoRankOf(pos.turn) ? { from: s, to, promo: true } : { from: s, to };
        if (!kingInCheck(apply(pos.board, m), pos.turn)) out.push(m);
      }
    }
    return out;
  }

  function makeMove(pos: Position, m: Move): Position {
    const reset = !!pos.board[m.to] || rules.gaits[typeOf(pos.board[m.from]!)] === 'pawn';
    return {
      board: apply(pos.board, m),
      turn: opposite(pos.turn),
      halfmove: reset ? 0 : pos.halfmove + 1,
      fullmove: pos.turn === 'b' ? pos.fullmove + 1 : pos.fullmove,
    };
  }

  const promoChar = rules.promoTo.toLowerCase();
  const moveToUci = (m: Move) => squareName(m.from) + squareName(m.to) + (m.promo ? promoChar : '');
  function uciToMove(uci: string): Move {
    const x = /^([a-h][1-8])([a-h][1-8])([a-z])?$/.exec(uci);
    if (!x) throw new Error(`Неверный ход: ${uci}`);
    const m: Move = { from: parseSquare(x[1]), to: parseSquare(x[2]) };
    if (x[3]) m.promo = true;
    return m;
  }

  return { targets, attacksFrom, findKing, kingInCheck, legalMoves, makeMove, moveToUci, uciToMove };
}

export const positionKey = (pos: Position) => pos.board.map((p) => p ?? '.').join('') + pos.turn;

/** Фигуры стороны: тип → количество (вместе с королём). */
export function material(board: Board, c: Color): Record<string, number> {
  const res: Record<string, number> = {};
  for (const p of board) if (p && colorOf(p) === c) res[typeOf(p)] = (res[typeOf(p)] ?? 0) + 1;
  return res;
}
export const pieceCount = (board: Board, c: Color) => board.filter((p) => p && colorOf(p) === c).length;

/** Позиция после последнего хода партии. */
export const lastPos = (start: Position, history: HistoryEntry[]) => (history.length ? history[history.length - 1].pos : start);

/** Троекратное повторение — ничья. */
export function repetitionDraw(start: Position, history: HistoryEntry[]): GameResult | null {
  if (history.length < 4) return null;
  return repetitionCount(start, history, positionKey).count >= 3 ? { winner: null, reason: 'repetition' } : null;
}

export function formatMove8(info: Record<string, PieceInfo>, h: HistoryEntry, promoTo: string) {
  const name = info[typeOf(h.piece)].short;
  const sep = h.captured ? '×' : '–';
  const promo = h.move.promo ? `=${info[promoTo].short}` : '';
  return `${name} ${squareName(h.move.from)}${sep}${squareName(h.move.to)}${promo}${h.check ? '+' : ''}`;
}

export type { Piece };
