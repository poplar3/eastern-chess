import { CAMBODIAN } from './cambodian';
import { JANGGI } from './janggi';
import { MAKRUK } from './makruk';
import { KYOTOSHOGI, MINISHOGI } from './minishogi';
import { SHATRANJ } from './shatranj';
import { SHOGI } from './shogi';
import { SITTUYIN } from './sittuyin';
import type { GameId, Variant } from './types';
import { MANCHU, XIANGQI } from './xiangqi';

export const VARIANTS: Record<GameId, Variant> = {
  janggi: JANGGI,
  xiangqi: XIANGQI,
  shogi: SHOGI,
  makruk: MAKRUK,
  shatranj: SHATRANJ,
  cambodian: CAMBODIAN,
  sittuyin: SITTUYIN,
  minishogi: MINISHOGI,
  kyotoshogi: KYOTOSHOGI,
  manchu: MANCHU,
};
export const GAME_IDS: GameId[] = ['janggi', 'xiangqi', 'shogi', 'makruk', 'shatranj', 'cambodian', 'sittuyin', 'minishogi', 'kyotoshogi', 'manchu'];
/** Основные игры — кнопками в заголовке. */
export const MAIN_GAME_IDS = GAME_IDS.filter((id) => VARIANTS[id].group === 'main');
/** Необычные вариации — отдельным списком. */
export const EXTRA_GAME_IDS = GAME_IDS.filter((id) => VARIANTS[id].group === 'extra');

export function getVariant(id: GameId | undefined | null): Variant {
  return (id && VARIANTS[id]) || JANGGI;
}

export { CAMBODIAN, JANGGI, KYOTOSHOGI, MAKRUK, MANCHU, MINISHOGI, SHATRANJ, SHOGI, SITTUYIN, XIANGQI };
