// Словесное описание варианта (плана), найденного движком.
import { Game } from '../core/game';
import { JANGGI } from '../core/janggi';
import { colorOf, isPass, plural, type Color, type Variant } from '../core/types';

export interface PlanSummary {
  moves: string[];
  /** Ожидаемый ответ соперника на первый ход линии. */
  reply: string | null;
  text: string;
}

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export function describePlan(fen: string, pv: string[], maxPlies = 8, variant: Variant = JANGGI): PlanSummary {
  const g = new Game(fen, variant);
  const moves: string[] = [];
  const gains: Record<Color, { names: string[]; points: number }> = { w: { names: [], points: 0 }, b: { names: [], points: 0 } };
  const checks: Record<Color, number> = { w: 0, b: 0 };
  let passes = 0;
  for (const uci of pv.slice(0, maxPlies)) {
    let h;
    try {
      h = g.playUci(uci);
    } catch {
      break;
    }
    moves.push(variant.formatMove(h));
    const c = colorOf(h.piece);
    if (h.captured) {
      gains[c].names.push(variant.pieceInfo(h.captured).acc);
      gains[c].points += variant.pieceValue(h.captured);
    }
    if (h.check) checks[c]++;
    if (isPass(h.move)) passes++;
  }
  const S = variant.sides;
  const first = g.history[0] ? colorOf(g.history[0].piece) : 'w';
  const parts: string[] = [];
  const result = g.result();
  if (result?.reason === 'checkmate') parts.push(`Вариант ведёт к мату: побеждает ${S[result.winner!]}.`);
  else if (result && result.winner) parts.push(`Вариант заканчивает партию: побеждает ${S[result.winner]}.`);
  else if (result) parts.push('Вариант ведёт к ничьей.');
  const unit = variant.id === 'janggi' ? 'очк.' : '';
  for (const c of [first, first === 'w' ? 'b' : 'w'] as Color[]) {
    if (!gains[c].names.length) continue;
    const pts = unit ? `${gains[c].points} ${unit}` : `${fmt(gains[c].points)} ${plural(Math.round(gains[c].points), 'очко', 'очка', 'очков')}`;
    parts.push(`${S[c]} забирает ${gains[c].names.join(', ')} (${pts}).`);
  }
  const net = gains[first].points - gains[first === 'w' ? 'b' : 'w'].points;
  if (!result && net === 0 && (gains.w.names.length || gains.b.names.length)) parts.push('Размен равный.');
  if (checks[first] >= 2) parts.push(`${S[first]} атакует ${variant.kingAcc} шахами.`);
  if (variant.hasHands && g.history.some((h) => h.move.from < 0)) parts.push('В варианте есть сброс фигур из руки.');
  if (!parts.length) parts.push(passes ? 'Выжидательный вариант с пропусками хода.' : 'Позиционный манёвр без немедленных взятий.');
  return { moves, reply: moves[1] ?? null, text: parts.join(' ') };
}
