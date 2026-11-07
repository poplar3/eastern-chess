import { describe, expect, it } from 'vitest';
import { JANGGI_PIECES } from '../core/janggi';
import { SHOGI_PIECES } from '../core/shogi';
import type { GameId } from '../core/types';
import { GAME_IDS } from '../core/variants';
import { XIANGQI_PIECES } from '../core/xiangqi';
import { MNEMONICS } from './mnemonics';
import { pieceGlyph } from './pieces';

const TYPES: Record<GameId, string[]> = {
  janggi: Object.keys(JANGGI_PIECES),
  xiangqi: Object.keys(XIANGQI_PIECES),
  shogi: Object.keys(SHOGI_PIECES),
  makruk: [],
  shatranj: [],
  cambodian: [],
  sittuyin: [],
  minishogi: [],
  kyotoshogi: [],
  manchu: [],
};

describe('подсказки по иероглифам', () => {
  for (const id of GAME_IDS.filter((g) => MNEMONICS[g])) {
    it(`${id}: знак на карточке совпадает со знаком на фигуре`, () => {
      for (const m of MNEMONICS[id]!.cards) expect(pieceGlyph(m.piece, id)).toBe(m.glyph);
    });
    it(`${id}: у каждого вида фигуры есть карточка`, () => {
      const glyphs = new Set(MNEMONICS[id]!.cards.map((m) => m.glyph));
      for (const t of TYPES[id])
        for (const p of [t, t.toLowerCase()]) expect(glyphs.has(pieceGlyph(p, id))).toBe(true);
    });
  }
});
