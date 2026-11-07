import { JANGGI, MOVE_LIMIT_PLIES } from './janggi';
import { generalsFacing } from './rules';
import { colorOf, isDrop, isPass, opposite, sameMove, type Color, type GameResult, type HistoryEntry, type Move, type Piece, type Position, type Variant } from './types';

export type { EndReason, GameResult, HistoryEntry } from './types';
export { MOVE_LIMIT_PLIES };

export class Game {
  readonly variant: Variant;
  readonly startFen: string;
  readonly start: Position;
  history: HistoryEntry[] = [];
  resigned: Color | null = null;

  constructor(startFen?: string, variant: Variant = JANGGI) {
    this.variant = variant;
    this.startFen = startFen ?? variant.startFen;
    this.start = variant.parseFen(this.startFen);
  }

  get position(): Position {
    return this.history.length ? this.history[this.history.length - 1].pos : this.start;
  }

  get turn(): Color {
    return this.position.turn;
  }

  get fen(): string {
    return this.variant.toFen(this.position);
  }

  get uciMoves(): string[] {
    return this.history.map((h) => h.uci);
  }

  legalMoves(): Move[] {
    return this.result() ? [] : this.variant.legalMoves(this.position);
  }

  isLegal(m: Move): boolean {
    return this.legalMoves().some((x) => sameMove(x, m));
  }

  play(m: Move): HistoryEntry {
    const v = this.variant;
    if (!this.isLegal(m)) throw new Error(`Нелегальный ход ${v.moveToUci(m)}`);
    const before = this.position;
    const pos = v.makeMove(before, m);
    const entry: HistoryEntry = {
      move: m,
      uci: v.moveToUci(m),
      piece: isDrop(m) ? (before.turn === 'w' ? m.drop! : m.drop!.toLowerCase()) : before.board[m.from]!,
      captured: isPass(m) || isDrop(m) ? null : before.board[m.to],
      check: v.inCheck(pos),
      pos,
    };
    this.history.push(entry);
    return entry;
  }

  playUci(uci: string): HistoryEntry {
    const legal = this.legalMoves();
    let m = legal.find((x) => this.variant.moveToUci(x) === uci);
    // Обязательное превращение движок может записать и без буквы фигуры (и наоборот): сверяем по полям.
    if (!m) {
      const same = legal.filter((x) => this.variant.moveToUci(x).slice(0, 4) === uci.slice(0, 4) && /^[a-z]\d[a-z]\d[a-z]?$/.test(uci));
      if (same.length === 1) m = same[0];
    }
    if (!m) throw new Error(`Нелегальный ход ${uci}`);
    return this.play(m);
  }

  undo(): HistoryEntry | undefined {
    this.resigned = null;
    return this.history.pop();
  }

  resign(c: Color) {
    this.resigned = c;
  }

  /** Биджанг на доске сейчас (генералы смотрят друг на друга) — только в Чанги. */
  get bikjang(): boolean {
    return this.variant.id === 'janggi' && generalsFacing(this.position.board);
  }

  inCheck(): boolean {
    return this.variant.inCheck(this.position);
  }

  /** Результат партии или null, если партия продолжается. */
  result(): GameResult | null {
    if (this.resigned) return { winner: opposite(this.resigned), reason: 'resign' };
    return this.variant.result(this.start, this.history);
  }

  /** Захваченные фигуры: кто кого взял. */
  captured(): Record<Color, Piece[]> {
    const res: Record<Color, Piece[]> = { w: [], b: [] };
    for (const h of this.history) if (h.captured) res[colorOf(h.piece)].push(h.captured);
    return res;
  }
}

/** Описание причины окончания партии в этой игре. */
export function endReasonText(g: Game, r: GameResult): string {
  return g.variant.endReasons[r.reason] ?? END_REASON_RU[r.reason];
}

export const END_REASON_RU: Record<GameResult['reason'], string> = {
  checkmate: 'Мат',
  stalemate: 'Нет ходов',
  bikjang: 'Биджанг: победа по очкам',
  'double-pass': 'Оба игрока пропустили ход: победа по очкам',
  'move-limit': '100 полуходов без взятий: победа по очкам',
  repetition: 'Повторение позиции: победа по очкам',
  'perpetual-check': 'Вечный шах запрещён',
  'pawn-drop-mate': 'Мат сбросом пешки запрещён',
  counting: 'Правило счёта: ничья',
  insufficient: 'Остались одни короли: ничья',
  'bare-king': 'Оголённый король',
  resign: 'Сдача',
};
