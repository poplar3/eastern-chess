import { JANGGI } from './janggi';
import { SHOGI } from './shogi';
import type { GameId, Variant } from './types';
import { XIANGQI } from './xiangqi';

export const VARIANTS: Record<GameId, Variant> = { janggi: JANGGI, xiangqi: XIANGQI, shogi: SHOGI };
export const GAME_IDS: GameId[] = ['janggi', 'xiangqi', 'shogi'];

export function getVariant(id: GameId | undefined | null): Variant {
  return (id && VARIANTS[id]) || JANGGI;
}

export { JANGGI, SHOGI, XIANGQI };
