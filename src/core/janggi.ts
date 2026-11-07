// Чанги как вариант игры: обёртка над правилами из rules.ts.
import {
  attacksFrom,
  FILE_LETTERS,
  FILES,
  findGeneral,
  generalsFacing,
  inCheck,
  legalMoves,
  makeMove,
  parseFen,
  parseSquare,
  PIECE_VALUES,
  pointsWinner,
  positionKey,
  RANKS,
  squareName,
  START_FEN,
  toFen,
  typeOf,
  uciToMove,
  type PieceType,
} from './rules';
import { isPass, opposite, perpetualCheck, repetitionCount, type HistoryEntry, type PieceInfo, type Position, type Variant } from './types';

export const JANGGI_PIECES: Record<PieceType, PieceInfo> = {
  K: { ru: 'Генерал', short: 'Г', acc: 'генерала', ins: 'генералом', native: '궁' },
  A: { ru: 'Страж', short: 'Ст', acc: 'стража', ins: 'стражем', native: '사' },
  B: { ru: 'Слон', short: 'Сл', acc: 'слона', ins: 'слоном', native: '상' },
  N: { ru: 'Конь', short: 'К', acc: 'коня', ins: 'конём', native: '마' },
  R: { ru: 'Колесница', short: 'Кл', acc: 'колесницу', ins: 'колесницей', native: '차' },
  C: { ru: 'Пушка', short: 'П', acc: 'пушку', ins: 'пушкой', native: '포' },
  P: { ru: 'Солдат', short: 'С', acc: 'солдата', ins: 'солдатом', native: '졸/병' },
};

export const MOVE_LIMIT_PLIES = 100;

function result(start: Position, history: HistoryEntry[]) {
  const n = history.length;
  const pos = n ? history[n - 1].pos : start;
  const prev = n >= 2 ? history[n - 2].pos : start;
  if (n > 0) {
    // Биджанг сохранился после ответного хода (или пропуска) — подсчёт очков.
    if (generalsFacing(pos.board) && generalsFacing(prev.board)) return { winner: pointsWinner(pos.board), reason: 'bikjang' as const };
    if (n >= 2 && isPass(history[n - 1].move) && isPass(history[n - 2].move)) return { winner: pointsWinner(pos.board), reason: 'double-pass' as const };
  }
  if (legalMoves(pos).length === 0) return { winner: opposite(pos.turn), reason: 'checkmate' as const };
  if (pos.halfmove >= MOVE_LIMIT_PLIES) return { winner: pointsWinner(pos.board), reason: 'move-limit' as const };
  if (n >= 4) {
    const { count, firstIdx } = repetitionCount(start, history, positionKey);
    if (count >= 3) {
      // Вечный шах: все ходы одной стороны в цикле давали шах — она проигрывает.
      const w = perpetualCheck(history, firstIdx, pos.turn);
      if (w) return { winner: w, reason: 'perpetual-check' as const };
      return { winner: pointsWinner(pos.board), reason: 'repetition' as const };
    }
  }
  return null;
}

export const JANGGI: Variant = {
  id: 'janggi',
  engine: 'janggi',
  name: 'Чанги',
  subtitle: 'корейские шахматы',
  mark: '將',
  files: FILES,
  ranks: RANKS,
  startFen: START_FEN,
  sides: { w: 'Чо', b: 'Хан' },
  sidesGen: { w: 'Чо', b: 'Хана' },
  kingAcc: 'генерала',
  hasPass: true,
  hasHands: false,
  hasPoints: true,
  board: 'lines',
  pluralSides: false,
  hasGlyphs: true,
  moveLimitPlies: MOVE_LIMIT_PLIES,
  parseFen,
  toFen,
  legalMoves,
  makeMove,
  inCheck: (pos) => inCheck(pos.board, pos.turn),
  kingSquare: findGeneral,
  attacksFrom,
  moveToUci: (m) => squareName(m.from) + squareName(m.to),
  uciToMove,
  squareName,
  engineSquare: squareName,
  parseSquare,
  fileLabels: FILE_LETTERS.split(''),
  rankLabels: Array.from({ length: RANKS }, (_, r) => String(r + 1)),
  pieceInfo: (p) => JANGGI_PIECES[typeOf(p)],
  pieceValue: (p) => PIECE_VALUES[typeOf(p)] ?? 0,
  formatMove(h) {
    if (isPass(h.move)) return 'пропуск';
    const name = JANGGI_PIECES[typeOf(h.piece)].short;
    const sep = h.captured ? '×' : '–';
    return `${name} ${squareName(h.move.from)}${sep}${squareName(h.move.to)}${h.check ? '+' : ''}`;
  },
  result,
  positionKey,
  endReasons: {
    checkmate: 'Мат',
    bikjang: 'Биджанг: победа по очкам',
    'double-pass': 'Оба игрока пропустили ход: победа по очкам',
    'move-limit': '100 полуходов без взятий: победа по очкам',
    repetition: 'Повторение позиции: победа по очкам',
    'perpetual-check': 'Вечный шах запрещён',
    resign: 'Сдача',
  },
};
