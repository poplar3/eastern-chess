import { JANGGI } from './janggi';
import type { HistoryEntry, Variant } from './types';

/** Запись хода по-русски: «Кл a1–a3», «К b1×c3+», «пропуск»; для сёги — «П 7g–7f», «С*5e». */
export function formatMove(h: HistoryEntry, variant: Variant = JANGGI): string {
  return variant.formatMove(h);
}
