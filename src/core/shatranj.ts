// Правила Шатранджа (старинные персидские и арабские шахматы).
// Ходы совпадают с вариантом "shatranj" движка Fairy-Stockfish: ферзь ходит на одну клетку по диагонали,
// слон (альфиль) прыгает ровно через одну клетку по диагонали, пешка превращается только в ферзя.
// Пат — поражение запатованного; оголённый король проигрывает, если сразу не может оголить короля соперника
// (тогда ничья); троекратное повторение и 50 ходов без взятий и ходов пешек — ничья.
import {
  FILE_LETTERS,
  formatMove8,
  lastPos,
  makeFen,
  makeMoves,
  parseSquare,
  pieceCount,
  positionKey,
  repetitionDraw,
  SIZE,
  squareName,
  type Chess8Rules,
} from './chess8';
import { colorOf, opposite, typeOf, type GameResult, type HistoryEntry, type PieceInfo, type Position, type Variant } from './types';

export const SHATRANJ_START = 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR w - - 0 1';
export const SHATRANJ_MOVE_LIMIT = 100;

export const SHATRANJ_PIECES: Record<string, PieceInfo> = {
  K: { ru: 'Король', short: 'Кр', acc: 'короля', ins: 'королём', native: 'شاه, шах' },
  Q: { ru: 'Ферзь', short: 'Ф', acc: 'ферзя', ins: 'ферзём', native: 'فرزين, ферзин' },
  B: { ru: 'Слон', short: 'С', acc: 'слона', ins: 'слоном', native: 'فيل, филь' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: 'فرس, фарас' },
  R: { ru: 'Ладья', short: 'Л', acc: 'ладью', ins: 'ладьёй', native: 'رخ, рух' },
  P: { ru: 'Пешка', short: 'П', acc: 'пешку', ins: 'пешкой', native: 'بيدق, байдак' },
};

/** Ценность фигур в пешках (приблизительная оценка для шатранджа). */
export const SHATRANJ_VALUES: Record<string, number> = { K: 0, R: 5, N: 3, Q: 1.5, B: 1.25, P: 1 };

const RULES: Chess8Rules = {
  gaits: { K: 'king', Q: 'fers', B: 'alfil', N: 'knight', R: 'rook', P: 'pawn' },
  promoRank: 7,
  promoTo: 'Q',
  pieces: SHATRANJ_PIECES,
};

const { parseFen, toFen } = makeFen(RULES);
const mv = makeMoves(RULES);

function result(start: Position, history: HistoryEntry[]): GameResult | null {
  const pos = lastPos(start, history);
  const us = pos.turn, them = opposite(us);
  const moves = mv.legalMoves(pos);
  // Мат и пат одинаково проигрывают.
  if (moves.length === 0) return { winner: them, reason: mv.kingInCheck(pos.board, us) ? 'checkmate' : 'stalemate' };
  const nUs = pieceCount(pos.board, us), nThem = pieceCount(pos.board, them);
  if (nUs === 1 && nThem === 1) return { winner: null, reason: 'insufficient' };
  if (nThem === 1) return { winner: us, reason: 'bare-king' };
  if (nUs === 1) {
    // Оголённый король ещё может спастись, если сразу заберёт последнюю фигуру соперника.
    const last = nThem === 2 && moves.some((m) => pos.board[m.to] && colorOf(pos.board[m.to]!) === them);
    if (!last) return { winner: them, reason: 'bare-king' };
  }
  const rep = repetitionDraw(start, history);
  if (rep) return rep;
  if (pos.halfmove >= SHATRANJ_MOVE_LIMIT) return { winner: null, reason: 'move-limit' };
  return null;
}

export const SHATRANJ: Variant = {
  id: 'shatranj',
  engine: 'shatranj',
  name: 'Шатрандж',
  subtitle: 'персидские шахматы',
  mark: '♞',
  files: SIZE,
  ranks: SIZE,
  startFen: SHATRANJ_START,
  sides: { w: 'Белые', b: 'Чёрные' },
  sidesGen: { w: 'белых', b: 'чёрных' },
  kingAcc: 'короля',
  hasPass: false,
  hasHands: false,
  hasPoints: false,
  board: 'cells',
  pluralSides: true,
  hasGlyphs: false,
  moveLimitPlies: SHATRANJ_MOVE_LIMIT,
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
  pieceInfo: (p) => SHATRANJ_PIECES[typeOf(p)],
  pieceValue: (p) => SHATRANJ_VALUES[typeOf(p)] ?? 0,
  formatMove: (h) => formatMove8(SHATRANJ_PIECES, h, 'Q'),
  result,
  positionKey,
  endReasons: {
    checkmate: 'Мат',
    stalemate: 'Пат: у стороны, которая ходит, нет ходов — это поражение',
    'bare-king': 'Оголённый король: у проигравшего остался один король',
    insufficient: 'Остались одни короли: ничья',
    'move-limit': '50 ходов без взятий и ходов пешек: ничья',
    repetition: 'Троекратное повторение позиции: ничья',
    resign: 'Сдача',
  },
};
