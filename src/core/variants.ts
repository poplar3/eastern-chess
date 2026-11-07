import { JANGGI } from './janggi';
import { MAKRUK } from './makruk';
import { SHATRANJ } from './shatranj';
import { SHOGI } from './shogi';
import type { GameId, Variant } from './types';
import { XIANGQI } from './xiangqi';

export const VARIANTS: Record<GameId, Variant> = { janggi: JANGGI, xiangqi: XIANGQI, shogi: SHOGI, makruk: MAKRUK, shatranj: SHATRANJ };
export const GAME_IDS: GameId[] = ['janggi', 'xiangqi', 'shogi', 'makruk', 'shatranj'];

export function getVariant(id: GameId | undefined | null): Variant {
  return (id && VARIANTS[id]) || JANGGI;
}

export { JANGGI, MAKRUK, SHATRANJ, SHOGI, XIANGQI };
