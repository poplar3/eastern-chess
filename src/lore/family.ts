import type { FamilyNode } from './types';

/**
 * Семейное древо шахмат. Новую игру достаточно добавить сюда с `parent` и `game`,
 * и она появится на древе во вкладке «История».
 */
export const FAMILY: FamilyNode[] = [
  { id: 'chaturanga', name: 'Чатуранга', when: 'Индия, VI в.' },
  { id: 'shatranj', name: 'Шатрандж', when: 'Персия, VI–VII вв.', parent: 'chaturanga', game: 'shatranj' },
  { id: 'chess', name: 'Европейские шахматы', when: 'около 1500', parent: 'shatranj' },
  { id: 'xiangqi', name: 'Сянци', when: 'Китай, к XI в.', parent: 'chaturanga', game: 'xiangqi' },
  { id: 'janggi', name: 'Чанги', when: 'Корея', parent: 'xiangqi', game: 'janggi' },
  { id: 'makruk', name: 'Макрук', when: 'Таиланд', parent: 'chaturanga', game: 'makruk' },
  { id: 'ouk', name: 'Ок чатранг', when: 'Камбоджа', parent: 'chaturanga' },
  { id: 'shogi', name: 'Сёги', when: 'Япония, к XI в.', parent: 'chaturanga', game: 'shogi' },
];
