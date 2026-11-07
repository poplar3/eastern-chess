// Общая основа для игр на доске 8×8 в клетках: Макрук (тайские шахматы), Шатрандж (старинные персидские),
// камбоджийские шахматы (ок) и Ситтуйин (бирманские).
// Фигуры записываются буквами Fairy-Stockfish: в макруке S — кхон, M — мет; в шатрандже Q — ферзь, B — слон (альфиль);
// в ситтуйине F — генерал (сит-ке).
// Рокировки и двойного хода пешки нет; пешка, дойдя до зоны превращения, обязательно превращается.
// Особые правила:
// - камбоджийские: король, пока не ходил и не получал шаха от ладьи, может первым ходом прыгнуть конём
//   на соседнюю горизонталь (без взятия и не из-под шаха), а мет, пока не ходил, — на две клетки вперёд без взятия;
// - ситтуйин: игроки сначала по очереди расставляют фигуры из руки в своей половине доски (ладьи — только на
//   первую горизонталь), пешка превращается в генерала не обязательно и только если генерала нет: стоя на диагонали
//   превращения (последняя пешка — где угодно), на месте или шагом по диагонали на свободное поле; новый генерал
//   не должен нападать на фигуры соперника, а сам ход — давать шах.
import {
  colorOf,
  opposite,
  repetitionCount,
  typeOf,
  type Board,
  type Color,
  type GameResult,
  type Hand,
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
  /** Камбоджийские особые первые ходы короля и мета. */
  cambodian?: boolean;
  /** Ситтуйин: расстановка из руки и превращение по диагонали. */
  sittuyin?: boolean;
}

/** Порядок фигур в руке ситтуйина. */
export const SITTUYIN_HAND = ['K', 'F', 'R', 'S', 'N'] as const;

/** Поле превращения ситтуйина на вертикали f для стороны c: большие диагонали в половине соперника. */
export function sittuyinPromoRank(f: number, c: Color) {
  const r = f < 4 ? SIZE - 1 - f : f;
  return c === 'w' ? r : SIZE - 1 - r;
}

// ---------- FEN ----------

export function makeFen(rules: Chess8Rules) {
  function parseFen(fen: string): Position {
    const parts = fen.trim().split(/\s+/);
    let placement = parts[0];
    let handStr = '';
    const br = /\[([^\]]*)\]$/.exec(placement);
    if (br) {
      handStr = br[1];
      placement = placement.slice(0, br.index);
    }
    const rows = placement.split('/');
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
    const pos: Position = { board, turn, halfmove: half || 0, fullmove: full || 1 };
    if (rules.sittuyin) {
      const hands: Record<Color, Hand> = { w: {}, b: {} };
      const re = /(\d*)([a-zA-Z])/g;
      let t: RegExpExecArray | null;
      while ((t = re.exec(handStr))) {
        const c: Color = t[2] === t[2].toUpperCase() ? 'w' : 'b';
        const k = t[2].toUpperCase();
        hands[c][k] = (hands[c][k] ?? 0) + (t[1] ? parseInt(t[1], 10) : 1);
      }
      pos.hands = hands;
    }
    if (rules.cambodian) {
      // Права на особый ход записаны в поле рокировки буквами вертикалей: «DEde».
      const gates: number[] = [];
      for (const ch of /^[A-Za-z]+$/.test(parts[2] ?? '') ? parts[2] : '') {
        const f = FILE_LETTERS.indexOf(ch.toLowerCase());
        if (f < 0) continue;
        const c: Color = ch === ch.toUpperCase() ? 'w' : 'b';
        const s = sq(f, c === 'w' ? 0 : SIZE - 1);
        if (board[s] && colorOf(board[s]!) === c) gates.push(s);
      }
      pos.gates = gates.sort((a, b) => a - b);
    }
    return pos;
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
    let hand = '';
    if (rules.sittuyin) {
      for (const c of ['w', 'b'] as const)
        for (const t of SITTUYIN_HAND) hand += (c === 'w' ? t : t.toLowerCase()).repeat(pos.hands?.[c][t] ?? 0);
      hand = `[${hand}]`;
    }
    let castling = '-';
    if (rules.cambodian && pos.gates?.length) {
      const letters = (c: Color) =>
        pos.gates!.filter((s) => rankOf(s) === (c === 'w' ? 0 : SIZE - 1)).map((s) => FILE_LETTERS[fileOf(s)]).sort().join('');
      castling = letters('w').toUpperCase() + letters('b') || '-';
    }
    return `${rows.join('/')}${hand} ${pos.turn} ${castling} - ${pos.halfmove} ${pos.fullmove}`;
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
    if (m.from < 0) {
      next[m.to] = m.drop!;
      return next;
    }
    const p = next[m.from]!;
    next[m.from] = null;
    next[m.to] = m.promo ? (colorOf(p) === 'w' ? rules.promoTo : rules.promoTo.toLowerCase()) : p;
    return next;
  }

  /** Доска после хода стороны `us` (у сброса фигура получает цвет стороны). */
  const applyFor = (board: Board, m: Move, us: Color) => apply(board, m.from < 0 ? { ...m, drop: us === 'w' ? m.drop : m.drop!.toLowerCase() } : m);

  const count = (board: Board, piece: string) => board.reduce((n, p) => n + (p === piece ? 1 : 0), 0);
  const fersAttacksEnemy = (board: Board, s: number, us: Color) =>
    DIAG.some(([df, dr]) => {
      const f = fileOf(s) + df, r = rankOf(s) + dr;
      const t = onBoard(f, r) ? board[sq(f, r)] : null;
      return !!t && colorOf(t) !== us;
    });

  function pseudoMoves(pos: Position): Move[] {
    const { board, turn: us } = pos;
    const out: Move[] = [];
    const hand = pos.hands?.[us] ?? {};
    // Ситтуйин: пока в руке есть фигуры, сторона только расставляет их в своей половине доски.
    if (rules.sittuyin && Object.values(hand).some((n) => (n ?? 0) > 0)) {
      for (const t of SITTUYIN_HAND) {
        if (!hand[t]) continue;
        for (let s = 0; s < board.length; s++) {
          if (board[s]) continue;
          const rr = us === 'w' ? rankOf(s) : SIZE - 1 - rankOf(s);
          if (rr > 2 || (t === 'R' && rr !== 0)) continue;
          out.push({ from: -1, to: s, drop: t });
        }
      }
      return out;
    }
    for (let s = 0; s < board.length; s++) {
      const p = board[s];
      if (!p || colorOf(p) !== us) continue;
      const pawn = rules.gaits[typeOf(p)] === 'pawn';
      for (const to of targets(board, s)) {
        const promo = pawn && !rules.sittuyin && rankOf(to) === promoRankOf(us);
        out.push(promo ? { from: s, to, promo: true } : { from: s, to });
      }
    }
    if (rules.sittuyin && count(board, us === 'w' ? 'F' : 'f') === 0) {
      const pawn = us === 'w' ? 'P' : 'p';
      const many = count(board, pawn) > 1;
      for (let s = 0; s < board.length; s++) {
        if (board[s] !== pawn || (many && rankOf(s) !== sittuyinPromoRank(fileOf(s), us))) continue;
        const dests = [s];
        for (const [df, dr] of DIAG) {
          const f = fileOf(s) + df, r = rankOf(s) + dr;
          if (onBoard(f, r) && !board[sq(f, r)]) dests.push(sq(f, r));
        }
        for (const to of dests) {
          const b = board.slice();
          b[s] = null;
          if (!fersAttacksEnemy(b, to, us)) out.push({ from: s, to, promo: true });
        }
      }
    }
    if (rules.cambodian && pos.gates?.length) {
      const fwd = us === 'w' ? 1 : -1;
      const k = findKing(board, us);
      if (k >= 0 && pos.gates.includes(k) && !kingInCheck(board, us)) {
        for (const df of [-2, 2]) {
          const f = fileOf(k) + df, r = rankOf(k) + fwd;
          if (onBoard(f, r) && !board[sq(f, r)]) out.push({ from: k, to: sq(f, r) });
        }
      }
      for (const s of pos.gates) {
        if (board[s] !== (us === 'w' ? 'M' : 'm')) continue;
        const r = rankOf(s) + 2 * fwd;
        if (onBoard(fileOf(s), r) && !board[sq(fileOf(s), r)]) out.push({ from: s, to: sq(fileOf(s), r) });
      }
    }
    return out;
  }

  function legalMoves(pos: Position): Move[] {
    const us = pos.turn;
    return pseudoMoves(pos).filter((m) => {
      const b = applyFor(pos.board, m, us);
      if (kingInCheck(b, us)) return false;
      // Ситтуйин: превращение не может давать шах.
      if (rules.sittuyin && m.promo && kingInCheck(b, opposite(us))) return false;
      return true;
    });
  }

  function makeMove(pos: Position, m: Move): Position {
    const us = pos.turn;
    const drop = m.from < 0;
    const reset = drop || !!pos.board[m.to] || rules.gaits[typeOf(pos.board[m.from]!)] === 'pawn';
    const next: Position = {
      board: applyFor(pos.board, m, us),
      turn: opposite(us),
      halfmove: reset ? 0 : pos.halfmove + 1,
      fullmove: us === 'b' ? pos.fullmove + 1 : pos.fullmove,
    };
    if (pos.hands) {
      const hands: Record<Color, Hand> = { w: { ...pos.hands.w }, b: { ...pos.hands.b } };
      if (drop) {
        hands[us][m.drop!] = (hands[us][m.drop!] ?? 0) - 1;
        if (!hands[us][m.drop!]) delete hands[us][m.drop!];
      }
      next.hands = hands;
    }
    if (pos.gates) {
      let gates = pos.gates.filter((s) => s !== m.from && s !== m.to);
      // Ладья, вставшая на одну линию с королём соперника, лишает его права на прыжок (как в Fairy-Stockfish).
      const p = pos.board[m.from];
      const k = findKing(next.board, opposite(us));
      if (p && typeOf(p) === 'R' && k >= 0 && gates.includes(k) && (fileOf(k) === fileOf(m.to) || rankOf(k) === rankOf(m.to))) {
        gates = gates.filter((s) => s !== k);
      }
      next.gates = gates;
    }
    return next;
  }

  const promoChar = rules.promoTo.toLowerCase();
  const moveToUci = (m: Move) => (m.from < 0 ? `${m.drop}@${squareName(m.to)}` : squareName(m.from) + squareName(m.to) + (m.promo ? promoChar : ''));
  function uciToMove(uci: string): Move {
    const d = /^([A-Z])@([a-h][1-8])$/.exec(uci);
    if (d) return { from: -1, to: parseSquare(d[2]), drop: d[1] };
    const x = /^([a-h][1-8])([a-h][1-8])([a-z])?$/.exec(uci);
    if (!x) throw new Error(`Неверный ход: ${uci}`);
    const m: Move = { from: parseSquare(x[1]), to: parseSquare(x[2]) };
    if (x[3]) m.promo = true;
    return m;
  }

  return { targets, attacksFrom, findKing, kingInCheck, legalMoves, makeMove, moveToUci, uciToMove };
}

export const positionKey = (pos: Position) =>
  pos.board.map((p) => p ?? '.').join('') + pos.turn + (pos.gates?.join(',') ?? '') + (pos.hands ? JSON.stringify(pos.hands) : '');

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
  if (h.move.from < 0) return `${info[h.move.drop!].short}*${squareName(h.move.to)}`;
  const name = info[typeOf(h.piece)].short;
  if (h.move.from === h.move.to) return `${name} ${squareName(h.move.to)}=${info[promoTo].short}${h.check ? '+' : ''}`;
  const sep = h.captured ? '×' : '–';
  const promo = h.move.promo ? `=${info[promoTo].short}` : '';
  return `${name} ${squareName(h.move.from)}${sep}${squareName(h.move.to)}${promo}${h.check ? '+' : ''}`;
}

export type { Piece };
