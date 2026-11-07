// Общие типы для всех игр приложения: Чанги, Сянци, Сёги, Макрук, Шатрандж и восточные вариации.

/** w — сторона, которая ходит первой (Чо, красные, сэнтэ); b — вторая (Хан, чёрные, готэ). */
export type Color = 'w' | 'b';
export type GameId =
  | 'janggi'
  | 'xiangqi'
  | 'shogi'
  | 'makruk'
  | 'shatranj'
  | 'cambodian'
  | 'sittuyin'
  | 'minishogi'
  | 'kyotoshogi'
  | 'manchu';
/** Семейство игры: от него зависят доска, вид фигур и общие правила. */
export type Family = 'janggi' | 'xiangqi' | 'shogi' | 'chess8';
/**
 * Фигура хранится символом FEN: заглавная — первая сторона, строчная — вторая.
 * Превращённые фигуры сёги записываются с плюсом: «+P», «+r».
 */
export type Piece = string;
export type Board = (Piece | null)[];

/** Фигуры в руке (сёги): тип (заглавная буква) → количество. */
export type Hand = Partial<Record<string, number>>;

export interface Move {
  /** Поле, с которого фигура ходит; −1 у сброса фигуры из руки. */
  from: number;
  to: number;
  /** Сброс из руки (сёги): тип фигуры, заглавной буквой. */
  drop?: string;
  /** Превращение (сёги, пешка в макруке и ситтуйине); у сброса — фигура ставится перевёрнутой (киото-сёги). */
  promo?: boolean;
  /** Обратное превращение (киото-сёги: перевёрнутая фигура возвращается на лицевую сторону). */
  demote?: boolean;
}

export interface Position {
  board: Board;
  turn: Color;
  halfmove: number; // полуходов без взятия
  fullmove: number;
  /** Фигуры в руке у каждой стороны (сёги; в ситтуйине — ещё не расставленные фигуры). */
  hands?: Record<Color, Hand>;
  /** Камбоджийские шахматы: поля короля и мета, которые ещё не ходили и сохраняют право на особый первый ход. */
  gates?: number[];
}

export type EndReason =
  | 'checkmate'
  | 'stalemate' // нет ходов без шаха — в сянци и сёги это поражение
  | 'bikjang' // биджанг не разорван — подсчёт очков
  | 'double-pass' // оба игрока пропустили ход — подсчёт очков
  | 'move-limit' // предел ходов без взятий
  | 'repetition' // повторение позиции
  | 'perpetual-check' // вечный шах запрещён — проигрывает шахующий
  | 'pawn-drop-mate' // сёги: мат сбросом пешки запрещён — проигрывает поставивший
  | 'counting' // макрук: сильнейшая сторона не успела поставить мат за отведённое число ходов — ничья
  | 'insufficient' // остались одни короли — ничья
  | 'bare-king' // шатрандж: у стороны остался один король — она проигрывает
  | 'resign';

export interface GameResult {
  /** null — ничья (в Чанги ничьих не бывает). */
  winner: Color | null;
  reason: EndReason;
}

export interface HistoryEntry {
  move: Move;
  uci: string;
  /** Фигура, которая ходила (у сброса — сброшенная фигура). */
  piece: Piece;
  captured: Piece | null;
  check: boolean;
  /** Позиция после хода. */
  pos: Position;
}

/** Названия фигуры по-русски в нужных падежах. */
export interface PieceInfo {
  ru: string;
  short: string;
  /** Винительный: «забирает колесницу». */
  acc: string;
  /** Творительный: «ходом колесницей». */
  ins: string;
  /** Название на языке игры (корейское, китайское, японское). */
  native: string;
}

export interface Variant {
  id: GameId;
  family: Family;
  /** main — основные игры, extra — необычные вариации (в отдельном списке). */
  group: 'main' | 'extra';
  /** Название варианта в Fairy-Stockfish (UCI_Variant). */
  engine: string;
  name: string;
  subtitle: string;
  /** Иероглиф для заголовка. */
  mark: string;
  files: number;
  ranks: number;
  startFen: string;
  /** Названия сторон: «Чо», «Красные», «Сэнтэ». */
  sides: Record<Color, string>;
  /** Родительный падеж: «ход Хана», «ход красных». */
  sidesGen: Record<Color, string>;
  /** Название главной фигуры в винительном падеже: «генерала», «короля». */
  kingAcc: string;
  /** Есть пропуск хода (Чанги). */
  hasPass: boolean;
  /** Взятые фигуры уходят в руку и могут быть сброшены (сёги); в ситтуйине рука — фигуры для расстановки. */
  hasHands: boolean;
  /** Порядок фигур в руке на доске. */
  handOrder?: readonly string[];
  /** Рука нужна только в начале партии (расстановка в ситтуйине): когда обе пусты, полосы рук не рисуются. */
  handsOnlyAtStart?: boolean;
  /** Подсказка к выбору превращения. */
  promoHint?: string;
  /** Партия может закончиться подсчётом очков (Чанги). */
  hasPoints: boolean;
  /** Фигуры стоят на пересечениях линий (Чанги, Сянци) или в клетках (Сёги, Макрук, Шатрандж). */
  board: 'lines' | 'cells';
  /** Название сторон во множественном числе: «красные ходят», а не «Чо ходит». */
  pluralSides: boolean;
  /** Есть традиционный вид фигур с иероглифами. */
  hasGlyphs: boolean;
  /** Идёт счёт ходов до ничьей (макрук): строка для панели или null. */
  countingText?(start: Position, history: HistoryEntry[]): string | null;
  /** Предел полуходов без взятий, 0 — нет. */
  moveLimitPlies: number;
  parseFen(fen: string): Position;
  toFen(pos: Position): string;
  legalMoves(pos: Position): Move[];
  makeMove(pos: Position, m: Move): Position;
  /** Под шахом ли сторона, которая ходит. */
  inCheck(pos: Position): boolean;
  kingSquare(board: Board, c: Color): number;
  /** Поля, которые бьёт фигура (без учёта шаха своему королю). */
  attacksFrom(board: Board, from: number): number[];
  moveToUci(m: Move): string;
  uciToMove(uci: string): Move;
  /** Поле в записи, привычной для этой игры. */
  squareName(s: number): string;
  /** Поле в записи движка (a1…i10). */
  engineSquare(s: number): string;
  parseSquare(name: string): number;
  /** Подписи вертикалей и горизонталей на доске (индекс — номер в массиве поля). */
  fileLabels: string[];
  rankLabels: string[];
  pieceInfo(p: Piece): PieceInfo;
  /** Ценность фигуры в очках (для описания разменов). */
  pieceValue(p: Piece): number;
  formatMove(h: HistoryEntry): string;
  result(start: Position, history: HistoryEntry[]): GameResult | null;
  positionKey(pos: Position): string;
  endReasons: Partial<Record<EndReason, string>>;
}

export const colorOf = (p: Piece): Color => (p === p.toUpperCase() ? 'w' : 'b');
export const typeOf = (p: Piece): string => p.toUpperCase();
export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');
/** Пропуск хода (Чанги). Превращение пешки на месте в ситтуйине — не пропуск. */
export const isPass = (m: Move) => m.from === m.to && !m.promo;
export const isDrop = (m: Move) => m.from < 0;
export const sameMove = (a: Move, b: Move) => a.from === b.from && a.to === b.to && (a.drop ?? '') === (b.drop ?? '') && !!a.promo === !!b.promo && !!a.demote === !!b.demote;

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * Повторение позиции. Возвращает число повторений текущей позиции и индекс первого из них
 * в массиве позиций (0 — начальная), просматривая назад до последнего взятия.
 */
export function repetitionCount(start: Position, history: HistoryEntry[], key: (p: Position) => string, resetOnCapture = true) {
  const n = history.length;
  const positions = [start, ...history.map((h) => h.pos)];
  const k = key(positions[n]);
  let count = 0;
  let firstIdx = n;
  for (let i = n; i >= 0; i -= 2) {
    if (key(positions[i]) === k) {
      count++;
      firstIdx = i;
    }
    if (resetOnCapture && i > 0 && (history[i - 1].captured || (i > 1 && history[i - 2].captured))) break;
  }
  return { count, firstIdx };
}

/**
 * Итог повторения: вечный шах проигрывает, иначе — `fallback`.
 * `firstIdx` — индекс первой из повторившихся позиций.
 */
export function perpetualCheck(history: HistoryEntry[], firstIdx: number, turn: Color): Color | null {
  const cycle = history.slice(firstIdx);
  const checksBy = (c: Color) => {
    const own = cycle.filter((h) => colorOf(h.piece) === c);
    return own.length > 0 && own.every((h) => h.check);
  };
  const lastMover = opposite(turn);
  const them = checksBy(lastMover);
  const us = checksBy(turn);
  if (them && !us) return turn;
  if (us && !them) return lastMover;
  return null;
}
