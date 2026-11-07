// Правила Макрука (тайские шахматы).
// Ходы совпадают с вариантом "makruk" движка Fairy-Stockfish. Пешки (бия) стоят на третьей горизонтали
// и превращаются в мета на шестой; пат — ничья; троекратное повторение — ничья.
// Правило счёта: когда пешек на доске не осталось, сильнейшая сторона должна поставить мат за 64 хода
// («честь доски»); когда у соперника остался один король — за 8–64 хода в зависимости от своих фигур
// («честь фигур»). Иначе ничья. Счёт ведётся с момента, когда наступило условие (упрощённо, как в Fairy-Stockfish).
import {
  FILE_LETTERS,
  formatMove8,
  lastPos,
  makeFen,
  makeMoves,
  material,
  parseSquare,
  pieceCount,
  positionKey,
  repetitionDraw,
  SIZE,
  squareName,
  type Chess8Rules,
} from './chess8';
import { opposite, plural, typeOf, type Board, type Color, type GameResult, type HistoryEntry, type PieceInfo, type Position, type Variant } from './types';

export const MAKRUK_START = 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1';

export const MAKRUK_PIECES: Record<string, PieceInfo> = {
  K: { ru: 'Король', short: 'Кр', acc: 'короля', ins: 'королём', native: 'ขุน, кхун' },
  M: { ru: 'Мет', short: 'М', acc: 'мета', ins: 'метом', native: 'เม็ด, мет' },
  S: { ru: 'Кхон', short: 'Кх', acc: 'кхона', ins: 'кхоном', native: 'โคน, кхон' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: 'ม้า, ма' },
  R: { ru: 'Ладья', short: 'Л', acc: 'ладью', ins: 'ладьёй', native: 'เรือ, руа' },
  P: { ru: 'Пешка', short: 'П', acc: 'пешку', ins: 'пешкой', native: 'เบี้ย, бия' },
};

/** Ценность фигур в пешках (оценка сильных игроков в макрук). */
export const MAKRUK_VALUES: Record<string, number> = { K: 0, R: 5, N: 3, S: 2.5, M: 1.5, P: 1 };

const RULES: Chess8Rules = {
  gaits: { K: 'king', M: 'fers', S: 'khon', N: 'knight', R: 'rook', P: 'pawn' },
  promoRank: 5,
  promoTo: 'M',
  pieces: MAKRUK_PIECES,
};

const { parseFen, toFen } = makeFen(RULES);
const mv = makeMoves(RULES);

/** Счёт до ничьей в этой позиции: что считается и сколько полуходов даётся. */
export function countingPhase(board: Board): { key: string; limit: number; strong: Color | null } | null {
  if (board.some((p) => p && typeOf(p) === 'P')) return null;
  const nw = pieceCount(board, 'w'), nb = pieceCount(board, 'b');
  if (nw === 1 && nb === 1) return null;
  if (nw === 1 || nb === 1) {
    const strong: Color = nw === 1 ? 'b' : 'w';
    const m = material(board, strong);
    const moves = (m.R ?? 0) >= 2 ? 8 : m.R ? 16 : (m.S ?? 0) >= 2 ? 22 : (m.N ?? 0) >= 2 ? 32 : m.S ? 44 : 64;
    return { key: `pieces:${strong}:${Object.entries(m).sort().join()}`, limit: moves * 2, strong };
  }
  return { key: 'board', limit: 128, strong: null };
}

/** Сколько полуходов уже идёт текущий счёт и сколько всего даётся. */
export function countingProgress(start: Position, history: HistoryEntry[]) {
  const positions = [start, ...history.map((h) => h.pos)];
  const cur = countingPhase(positions[positions.length - 1].board);
  if (!cur) return null;
  let i = positions.length - 1;
  while (i > 0 && countingPhase(positions[i - 1].board)?.key === cur.key) i--;
  return { ...cur, plies: positions.length - 1 - i };
}

function result(start: Position, history: HistoryEntry[]): GameResult | null {
  const pos = lastPos(start, history);
  if (mv.legalMoves(pos).length === 0) {
    return mv.kingInCheck(pos.board, pos.turn) ? { winner: opposite(pos.turn), reason: 'checkmate' } : { winner: null, reason: 'stalemate' };
  }
  if (pieceCount(pos.board, 'w') === 1 && pieceCount(pos.board, 'b') === 1) return { winner: null, reason: 'insufficient' };
  const rep = repetitionDraw(start, history);
  if (rep) return rep;
  const c = countingProgress(start, history);
  if (c && c.plies >= c.limit) return { winner: null, reason: 'counting' };
  return null;
}

export const MAKRUK: Variant = {
  id: 'makruk',
  engine: 'makruk',
  name: 'Макрук',
  subtitle: 'тайские шахматы',
  mark: '♜',
  files: SIZE,
  ranks: SIZE,
  startFen: MAKRUK_START,
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
  pieceInfo: (p) => MAKRUK_PIECES[typeOf(p)],
  pieceValue: (p) => MAKRUK_VALUES[typeOf(p)] ?? 0,
  formatMove: (h) => formatMove8(MAKRUK_PIECES, h, 'M'),
  result,
  positionKey,
  countingText(start, history) {
    const c = countingProgress(start, history);
    if (!c) return null;
    const done = Math.floor(c.plies / 2), total = c.limit / 2;
    const what = c.strong ? `У ${c.strong === 'w' ? 'чёрных' : 'белых'} остался один король` : 'Пешек на доске не осталось';
    return `${what}: счёт ${done} из ${total} ${plural(total, 'хода', 'ходов', 'ходов')} до ничьей`;
  },
  endReasons: {
    checkmate: 'Мат',
    stalemate: 'Пат: у стороны, которая ходит, нет ходов — ничья',
    repetition: 'Троекратное повторение позиции: ничья',
    insufficient: 'Остались одни короли: ничья',
    counting: 'Правило счёта: мат не поставлен за отведённое число ходов — ничья',
    resign: 'Сдача',
  },
};
