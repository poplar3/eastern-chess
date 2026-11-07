import type { Color, Setup } from './core/rules';
import type { GameId } from './core/types';
import type { PieceStyle } from './ui/pieces';

export interface GameConfig {
  /** Игра: Чанги, Сянци, Сёги, Макрук или Шатрандж. */
  variant: GameId;
  mode: 'human' | 'bot';
  /** За кого играет человек в партии с ботом. */
  humanColor: Color;
  level: number;
  choSetup: Setup;
  hanSetup: Setup;
  pieceStyle: PieceStyle;
}

export const DEFAULT_CONFIG: GameConfig = {
  variant: 'janggi',
  mode: 'bot',
  humanColor: 'w',
  level: 3,
  choSetup: 'NBBN',
  hanSetup: 'NBBN',
  pieceStyle: 'icons',
};

const KEY = 'janggi.config.v1';

export function loadConfig(): GameConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // нет доступа к хранилищу — используем значения по умолчанию
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(c: GameConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // не критично
  }
}

/** Оформление: как в системе, светлое или ночное. */
export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  /** Оценивать каждый ход во время игры. */
  evalMoves: boolean;
  theme: Theme;
}

const DEFAULT_PREFS: Prefs = { evalMoves: true, theme: 'system' };

/** Тема, которая действует сейчас: «как в системе» раскрывается в светлую или ночную. */
export function effectiveTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Ставит тему на <html data-theme>: от неё зависят цвета в CSS. */
export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  const eff = effectiveTheme(t);
  document.documentElement.dataset.theme = eff;
  document.documentElement.style.colorScheme = eff;
}

const PREFS_KEY = 'janggi.prefs.v1';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // нет доступа к хранилищу
  }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // не критично
  }
}
