// Правила камбоджийских шахмат (ок чатранг, អុកចត្រង្គ).
// Ходы совпадают с вариантом "cambodian" движка Fairy-Stockfish. Это почти макрук: те же фигуры и превращение
// пешки в мета на шестой горизонтали, но у короля и мета есть особый первый ход:
// - король, пока не ходил и не получал шаха от ладьи, может прыгнуть «конём» на соседнюю горизонталь
//   (с d1 на b2 или f2), без взятия и не из-под шаха;
// - мет, пока не ходил, может шагнуть на две клетки вперёд (с e1 на e3), без взятия.
// Права хранятся в поле рокировки FEN: «DEde». Правило счёта камбоджийское: когда у слабой стороны не больше
// трёх фигур, сильная должна поставить мат за 63 хода, а против одинокого короля — за 7–63 хода (упрощённо).
import { FILE_LETTERS, formatMove8, makeFen, makeMoves, parseSquare, positionKey, SIZE, squareName, type Chess8Rules } from './chess8';
import { countingLine, makrukResult, MAKRUK_VALUES } from './makruk';
import { typeOf, type HistoryEntry, type PieceInfo, type Position, type Variant } from './types';

export const CAMBODIAN_START = 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w DEde - 0 1';

export const CAMBODIAN_PIECES: Record<string, PieceInfo> = {
  K: { ru: 'Король', short: 'Кр', acc: 'короля', ins: 'королём', native: 'អង្គ, анг' },
  M: { ru: 'Нианг', short: 'Нг', acc: 'нианг', ins: 'нианг', native: 'នាង, нианг (госпожа)' },
  S: { ru: 'Кол', short: 'Кл', acc: 'кол', ins: 'колом', native: 'គោល, кол (столб)' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: 'សេះ, сэх' },
  R: { ru: 'Лодка', short: 'Л', acc: 'лодку', ins: 'лодкой', native: 'ទូក, тук' },
  P: { ru: 'Рыба', short: 'Р', acc: 'рыбу', ins: 'рыбой', native: 'ត្រី, трей' },
};

const RULES: Chess8Rules = {
  gaits: { K: 'king', M: 'fers', S: 'khon', N: 'knight', R: 'rook', P: 'pawn' },
  promoRank: 5,
  promoTo: 'M',
  pieces: CAMBODIAN_PIECES,
  cambodian: true,
};

const { parseFen, toFen } = makeFen(RULES);
const mv = makeMoves(RULES);

export const CAMBODIAN: Variant = {
  id: 'cambodian',
  family: 'chess8',
  group: 'extra',
  engine: 'cambodian',
  name: 'Ок',
  subtitle: 'камбоджийские шахматы',
  mark: '♜',
  files: SIZE,
  ranks: SIZE,
  startFen: CAMBODIAN_START,
  sides: { w: 'Белые', b: 'Чёрные' },
  sidesGen: { w: 'белых', b: 'чёрных' },
  kingAcc: 'короля',
  hasPass: false,
  hasHands: false,
  hasPoints: false,
  board: 'cells',
  pluralSides: true,
  hasGlyphs: false,
  moveLimitPlies: 0,
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
  pieceInfo: (p) => CAMBODIAN_PIECES[typeOf(p)],
  pieceValue: (p) => MAKRUK_VALUES[typeOf(p)] ?? 0,
  formatMove: (h) => formatMove8(CAMBODIAN_PIECES, h, 'M'),
  result: (start: Position, history: HistoryEntry[]) => makrukResult(mv, 'cambodian', start, history),
  positionKey,
  countingText: (start, history) => countingLine(start, history, 'cambodian', { w: 'белых', b: 'чёрных' }),
  endReasons: {
    checkmate: 'Мат',
    stalemate: 'Пат: у стороны, которая ходит, нет ходов — ничья',
    repetition: 'Троекратное повторение позиции: ничья',
    insufficient: 'Остались одни короли: ничья',
    counting: 'Правило счёта: мат не поставлен за отведённое число ходов — ничья',
    resign: 'Сдача',
  },
};
