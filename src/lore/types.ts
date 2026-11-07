import type { GameId } from '../core/types';

/** Событие на ленте времени. */
export interface LoreEvent {
  /** Когда: «VI в.», «1058», «около 1500». */
  when: string;
  what: string;
}

/** Слово из языка игры: название фигуры, термин. */
export interface LoreWord {
  native: string;
  /** Чтение по-русски. */
  reading: string;
  meaning: string;
}

/** История одного вида шахмат для вкладки «История». */
export interface GameLore {
  /** Одна фраза под заголовком. */
  tagline: string;
  /** Где и когда появилась: «Китай, VIII–XII вв.». */
  origin: string;
  timeline: LoreEvent[];
  /** Разделы рассказа: заголовок и абзацы. */
  sections: { title: string; paragraphs: string[] }[];
  /** Слова, которые стоит знать. */
  words?: LoreWord[];
  /** Короткие любопытные факты. */
  facts: string[];
}

/** Узел семейного древа шахмат. `game` — если игра есть в приложении. */
export interface FamilyNode {
  id: string;
  name: string;
  when: string;
  parent?: string;
  game?: GameId;
}
