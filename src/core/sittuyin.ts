// Правила Ситтуйина (бирманские шахматы, စစ်တုရင်).
// Ходы совпадают с вариантом "sittuyin" движка Fairy-Stockfish:
// - пешки стоят уступом на третьей и четвёртой горизонталях, остальные фигуры игроки по очереди расставляют сами
//   на своих трёх ближних горизонталях (ладьи — только на первую); пока в руке есть фигуры, ходить ими нельзя;
// - фигуры ходят как в макруке: генерал (сит-ке) — на клетку по диагонали, слон (син) — как кхон;
// - пешка превращается в генерала, только если своего генерала нет, и не обязательно: стоя на большой диагонали
//   в половине соперника (последняя оставшаяся пешка — на любом поле) — на месте или шагом по диагонали на свободное
//   поле; новый генерал не должен нападать на фигуры соперника, а ход — давать шах;
// - пат — ничья; троекратное повторение и 50 ходов без взятий и ходов пешек — ничья; правило счёта АСЕАН против
//   одинокого короля (упрощённо, как в макруке).
import { FILE_LETTERS, formatMove8, lastPos, makeFen, makeMoves, parseSquare, pieceCount, positionKey, SITTUYIN_HAND, SIZE, squareName, type Chess8Rules } from './chess8';
import { countingLine, makrukResult } from './makruk';
import { typeOf, type GameResult, type HistoryEntry, type PieceInfo, type Position, type Variant } from './types';

export const SITTUYIN_START = '8/8/4pppp/pppp4/4PPPP/PPPP4/8/8[KFRRSSNNkfrrssnn] w - - 0 1';
export const SITTUYIN_MOVE_LIMIT = 100;

export const SITTUYIN_PIECES: Record<string, PieceInfo> = {
  K: { ru: 'Король', short: 'Кр', acc: 'короля', ins: 'королём', native: 'မင်းကြီး, мин-джи' },
  F: { ru: 'Генерал', short: 'Г', acc: 'генерала', ins: 'генералом', native: 'စစ်ကဲ, сит-ке' },
  S: { ru: 'Слон', short: 'С', acc: 'слона', ins: 'слоном', native: 'ဆင်, син' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: 'မြင်း, мьин' },
  R: { ru: 'Колесница', short: 'Кл', acc: 'колесницу', ins: 'колесницей', native: 'ရထား, ятта' },
  P: { ru: 'Пешка', short: 'П', acc: 'пешку', ins: 'пешкой', native: 'နယ်, не' },
};

/** Ценность фигур в пешках (как в макруке). */
export const SITTUYIN_VALUES: Record<string, number> = { K: 0, R: 5, N: 3, S: 2.5, F: 1.5, P: 1 };

const RULES: Chess8Rules = {
  gaits: { K: 'king', F: 'fers', S: 'khon', N: 'knight', R: 'rook', P: 'pawn' },
  promoRank: 7,
  promoTo: 'F',
  pieces: SITTUYIN_PIECES,
  sittuyin: true,
};

const { parseFen, toFen } = makeFen(RULES);
const mv = makeMoves(RULES);

/** Идёт ли ещё расстановка: у кого-то в руке остались фигуры. */
export function inSetup(pos: Position) {
  return (['w', 'b'] as const).some((c) => Object.values(pos.hands?.[c] ?? {}).some((n) => (n ?? 0) > 0));
}

function result(start: Position, history: HistoryEntry[]): GameResult | null {
  const r = makrukResult(mv, 'asean', start, history);
  if (r) return r;
  const pos = lastPos(start, history);
  if (inSetup(pos)) return null;
  if (pos.halfmove >= SITTUYIN_MOVE_LIMIT) return { winner: null, reason: 'move-limit' };
  // Король и одна пешка, шаха нет и есть только превращения: ничья (правило 3.9 c.7).
  const own = pos.board.filter((p) => p && (p === p.toUpperCase()) === (pos.turn === 'w'));
  if (pieceCount(pos.board, pos.turn) === 2 && own.some((p) => typeOf(p!) === 'P') && !mv.kingInCheck(pos.board, pos.turn)) {
    if (mv.legalMoves(pos).every((m) => m.promo)) return { winner: null, reason: 'stalemate' };
  }
  return null;
}

export const SITTUYIN: Variant = {
  id: 'sittuyin',
  family: 'chess8',
  group: 'extra',
  engine: 'sittuyin',
  name: 'Ситтуйин',
  subtitle: 'бирманские шахматы',
  mark: '♞',
  files: SIZE,
  ranks: SIZE,
  startFen: SITTUYIN_START,
  sides: { w: 'Белые', b: 'Чёрные' },
  sidesGen: { w: 'белых', b: 'чёрных' },
  kingAcc: 'короля',
  hasPass: false,
  hasHands: true,
  handOrder: SITTUYIN_HAND,
  handsOnlyAtStart: true,
  promoHint: 'Пешка может превратиться в генерала на месте или шагом по диагонали.',
  hasPoints: false,
  board: 'cells',
  pluralSides: true,
  hasGlyphs: false,
  moveLimitPlies: SITTUYIN_MOVE_LIMIT,
  parseFen,
  toFen,
  legalMoves: mv.legalMoves,
  makeMove: mv.makeMove,
  inCheck: (pos) => mv.kingInCheck(pos.board, pos.turn),
  kingSquare: mv.findKing,
  attacksFrom: mv.attacksFrom,
  moveToUci: mv.moveToUci,
  uciToMove: mv.uciToMove,
  squareName,
  engineSquare: squareName,
  parseSquare,
  fileLabels: FILE_LETTERS.split(''),
  rankLabels: Array.from({ length: SIZE }, (_, r) => String(r + 1)),
  pieceInfo: (p) => SITTUYIN_PIECES[typeOf(p)],
  pieceValue: (p) => SITTUYIN_VALUES[typeOf(p)] ?? 0,
  formatMove: (h) => formatMove8(SITTUYIN_PIECES, h, 'F'),
  result,
  positionKey,
  countingText: (start, history) => countingLine(start, history, 'asean', { w: 'белых', b: 'чёрных' }),
  endReasons: {
    checkmate: 'Мат',
    stalemate: 'Пат: у стороны, которая ходит, нет ходов (кроме превращения) — ничья',
    repetition: 'Троекратное повторение позиции: ничья',
    insufficient: 'Остались одни короли: ничья',
    'move-limit': '50 ходов без взятий и ходов пешек: ничья',
    counting: 'Правило счёта: мат одинокому королю не поставлен вовремя — ничья',
    resign: 'Сдача',
  },
};
