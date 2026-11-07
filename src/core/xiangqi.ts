// Правила Сянци (китайские шахматы).
// Семантика совпадает с вариантом "xiangqi" движка Fairy-Stockfish: мат и пат — поражение,
// «летающий генерал», вечный шах проигрывает, троекратное повторение и 50 ходов без взятий — ничья.
// Правило «вечного преследования» (AXF) не проверяется: такое повторение считается ничьей.
import { FILE_LETTERS, FILES, fileOf, onBoard, parseFen, parseSquare, RANKS, rankOf, sq, squareName, toFen, uciToMove } from './rules';
import {
  colorOf,
  opposite,
  perpetualCheck,
  repetitionCount,
  typeOf,
  type Board,
  type Color,
  type GameResult,
  type HistoryEntry,
  type Move,
  type PieceInfo,
  type Position,
  type Variant,
} from './types';

export const XIANGQI_START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
export const XIANGQI_MOVE_LIMIT = 100;

export const XIANGQI_PIECES: Record<string, PieceInfo> = {
  K: { ru: 'Генерал', short: 'Г', acc: 'генерала', ins: 'генералом', native: '帥/將' },
  A: { ru: 'Советник', short: 'Сов', acc: 'советника', ins: 'советником', native: '仕/士' },
  B: { ru: 'Слон', short: 'Сл', acc: 'слона', ins: 'слоном', native: '相/象' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: '傌/馬' },
  R: { ru: 'Колесница', short: 'Кл', acc: 'колесницу', ins: 'колесницей', native: '俥/車' },
  C: { ru: 'Пушка', short: 'П', acc: 'пушку', ins: 'пушкой', native: '炮/砲' },
  P: { ru: 'Солдат', short: 'С', acc: 'солдата', ins: 'солдатом', native: '兵/卒' },
};

/** Ценность фигур в пешках (общепринятая оценка). */
export const XIANGQI_VALUES: Record<string, number> = { K: 0, R: 9, C: 4.5, N: 4, B: 2, A: 2, P: 1 };

const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function inPalace(f: number, r: number, c: Color) {
  return f >= 3 && f <= 5 && (c === 'w' ? r <= 2 : r >= 7);
}
const ownSide = (r: number, c: Color) => (c === 'w' ? r <= 4 : r >= 5);

function pieceMoves(board: Board, from: number, out: Move[]) {
  const p = board[from]!;
  const us = colorOf(p);
  const f0 = fileOf(from), r0 = rankOf(from);
  const add = (f: number, r: number) => {
    if (!onBoard(f, r)) return;
    const t = board[sq(f, r)];
    if (t && colorOf(t) === us) return;
    out.push({ from, to: sq(f, r) });
  };
  switch (typeOf(p)) {
    case 'K':
      for (const [df, dr] of ORTHO) if (inPalace(f0 + df, r0 + dr, us)) add(f0 + df, r0 + dr);
      break;
    case 'A':
      for (const [df, dr] of DIAG) if (inPalace(f0 + df, r0 + dr, us)) add(f0 + df, r0 + dr);
      break;
    case 'B':
      for (const [df, dr] of DIAG) {
        const ef = f0 + df, er = r0 + dr;
        const f = f0 + 2 * df, r = r0 + 2 * dr;
        if (!onBoard(f, r) || !ownSide(r, us) || board[sq(ef, er)]) continue;
        add(f, r);
      }
      break;
    case 'N':
      for (const [df, dr] of ORTHO) {
        const lf = f0 + df, lr = r0 + dr;
        if (!onBoard(lf, lr) || board[sq(lf, lr)]) continue;
        const sides: [number, number][] = df ? [[df, 1], [df, -1]] : [[1, dr], [-1, dr]];
        for (const [sf, sr] of sides) add(lf + sf, lr + sr);
      }
      break;
    case 'R':
      for (const [df, dr] of ORTHO) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r)) {
          const t = board[sq(f, r)];
          if (t) {
            if (colorOf(t) !== us) out.push({ from, to: sq(f, r) });
            break;
          }
          out.push({ from, to: sq(f, r) });
          f += df;
          r += dr;
        }
      }
      break;
    case 'C':
      for (const [df, dr] of ORTHO) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r) && !board[sq(f, r)]) {
          out.push({ from, to: sq(f, r) });
          f += df;
          r += dr;
        }
        // f, r — экран; бьёт первую фигуру за ним
        f += df;
        r += dr;
        while (onBoard(f, r)) {
          const t = board[sq(f, r)];
          if (t) {
            if (colorOf(t) !== us) out.push({ from, to: sq(f, r) });
            break;
          }
          f += df;
          r += dr;
        }
      }
      break;
    case 'P': {
      const fwd = us === 'w' ? 1 : -1;
      add(f0, r0 + fwd);
      if (!ownSide(r0, us)) {
        add(f0 - 1, r0);
        add(f0 + 1, r0);
      }
      break;
    }
  }
}

export function findKing(board: Board, c: Color) {
  return board.indexOf(c === 'w' ? 'K' : 'k');
}

/** Генералы стоят на одной вертикали без фигур между ними. */
export function kingsFacing(board: Board): boolean {
  const w = findKing(board, 'w'), b = findKing(board, 'b');
  if (w < 0 || b < 0 || fileOf(w) !== fileOf(b)) return false;
  for (let s = w + FILES; s < b; s += FILES) if (board[s]) return false;
  return true;
}

export function attacksFrom(board: Board, from: number): number[] {
  const out: Move[] = [];
  if (board[from]) pieceMoves(board, from, out);
  return out.map((m) => m.to);
}

function isAttacked(board: Board, target: number, by: Color) {
  const out: Move[] = [];
  for (let s = 0; s < board.length; s++) {
    const p = board[s];
    if (p && colorOf(p) === by) pieceMoves(board, s, out);
  }
  return out.some((m) => m.to === target);
}

/** Шах стороне `c`; встреча генералов на открытой вертикали тоже считается шахом. */
export function kingInCheck(board: Board, c: Color) {
  const k = findKing(board, c);
  if (k < 0) return false;
  return kingsFacing(board) || isAttacked(board, k, opposite(c));
}

function apply(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

export function legalMoves(pos: Position): Move[] {
  const pseudo: Move[] = [];
  for (let s = 0; s < pos.board.length; s++) {
    const p = pos.board[s];
    if (p && colorOf(p) === pos.turn) pieceMoves(pos.board, s, pseudo);
  }
  return pseudo.filter((m) => !kingInCheck(apply(pos.board, m), pos.turn));
}

export function makeMove(pos: Position, m: Move): Position {
  const capture = !!pos.board[m.to];
  return {
    board: apply(pos.board, m),
    turn: opposite(pos.turn),
    halfmove: capture ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === 'b' ? pos.fullmove + 1 : pos.fullmove,
  };
}

const positionKey = (pos: Position) => pos.board.map((p) => p ?? '.').join('') + pos.turn;

function result(start: Position, history: HistoryEntry[]): GameResult | null {
  const n = history.length;
  const pos = n ? history[n - 1].pos : start;
  if (legalMoves(pos).length === 0) {
    return { winner: opposite(pos.turn), reason: kingInCheck(pos.board, pos.turn) ? 'checkmate' : 'stalemate' };
  }
  if (n >= 4) {
    const { count, firstIdx } = repetitionCount(start, history, positionKey);
    if (count >= 3) {
      const w = perpetualCheck(history, firstIdx, pos.turn);
      return w ? { winner: w, reason: 'perpetual-check' } : { winner: null, reason: 'repetition' };
    }
  }
  if (pos.halfmove >= XIANGQI_MOVE_LIMIT) return { winner: null, reason: 'move-limit' };
  return null;
}

export const XIANGQI: Variant = {
  id: 'xiangqi',
  engine: 'xiangqi',
  name: 'Сянци',
  subtitle: 'китайские шахматы',
  mark: '帥',
  files: FILES,
  ranks: RANKS,
  startFen: XIANGQI_START,
  sides: { w: 'Красные', b: 'Чёрные' },
  sidesGen: { w: 'красных', b: 'чёрных' },
  kingAcc: 'генерала',
  hasPass: false,
  hasHands: false,
  hasPoints: false,
  board: 'lines',
  pluralSides: true,
  hasGlyphs: true,
  moveLimitPlies: XIANGQI_MOVE_LIMIT,
  parseFen,
  toFen,
  legalMoves,
  makeMove,
  inCheck: (pos) => kingInCheck(pos.board, pos.turn),
  kingSquare: findKing,
  attacksFrom,
  moveToUci: (m) => squareName(m.from) + squareName(m.to),
  uciToMove,
  squareName,
  engineSquare: squareName,
  parseSquare,
  fileLabels: FILE_LETTERS.split(''),
  rankLabels: Array.from({ length: RANKS }, (_, r) => String(r + 1)),
  pieceInfo: (p) => XIANGQI_PIECES[typeOf(p)],
  pieceValue: (p) => XIANGQI_VALUES[typeOf(p)] ?? 0,
  formatMove(h) {
    const name = XIANGQI_PIECES[typeOf(h.piece)].short;
    const sep = h.captured ? '×' : '–';
    return `${name} ${squareName(h.move.from)}${sep}${squareName(h.move.to)}${h.check ? '+' : ''}`;
  },
  result,
  positionKey,
  endReasons: {
    checkmate: 'Мат',
    stalemate: 'Пат: у стороны, которая ходит, нет ходов — это поражение',
    'move-limit': '50 ходов без взятий: ничья',
    repetition: 'Троекратное повторение позиции: ничья',
    'perpetual-check': 'Вечный шах запрещён: проигрывает шахующий',
    resign: 'Сдача',
  },
};
