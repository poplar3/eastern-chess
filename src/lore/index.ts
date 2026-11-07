import type { GameId } from '../core/types';
import { CAMBODIAN_LORE } from './cambodian';
import { JANGGI_LORE } from './janggi';
import { KYOTOSHOGI_LORE } from './kyotoshogi';
import { MANCHU_LORE } from './manchu';
import { MINISHOGI_LORE } from './minishogi';
import { SITTUYIN_LORE } from './sittuyin';
import { MAKRUK_LORE } from './makruk';
import { SHATRANJ_LORE } from './shatranj';
import { SHOGI_LORE } from './shogi';
import type { GameLore } from './types';
import { XIANGQI_LORE } from './xiangqi';

export { FAMILY } from './family';
export type { FamilyNode, GameLore, LoreEvent, LoreWord } from './types';

/**
 * История каждой игры для вкладки «История».
 * Чтобы добавить историю новой игры: создать файл рядом (по образцу janggi.ts),
 * добавить его сюда и узел в family.ts. Без записи вкладка покажет заглушку.
 */
export const LORE: Partial<Record<GameId, GameLore>> = {
  janggi: JANGGI_LORE,
  xiangqi: XIANGQI_LORE,
  shogi: SHOGI_LORE,
  makruk: MAKRUK_LORE,
  shatranj: SHATRANJ_LORE,
  cambodian: CAMBODIAN_LORE,
  sittuyin: SITTUYIN_LORE,
  minishogi: MINISHOGI_LORE,
  kyotoshogi: KYOTOSHOGI_LORE,
  manchu: MANCHU_LORE,
};

export const loreFor = (id: GameId): GameLore | null => LORE[id] ?? null;
