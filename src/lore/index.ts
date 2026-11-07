import type { GameId } from '../core/types';
import { JANGGI_LORE } from './janggi';
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
};

export const loreFor = (id: GameId): GameLore | null => LORE[id] ?? null;
