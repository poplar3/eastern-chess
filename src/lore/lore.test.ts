import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../core/variants';
import { FAMILY, LORE } from './index';

describe('история игр', () => {
  it('у каждой игры есть история и узел на древе', () => {
    for (const id of GAME_IDS) {
      const lore = LORE[id];
      expect(lore, id).toBeTruthy();
      expect(lore!.sections.length, id).toBeGreaterThan(0);
      expect(lore!.timeline.length, id).toBeGreaterThan(0);
      expect(FAMILY.some((n) => n.game === id), id).toBe(true);
    }
  });

  it('древо связное и без повторов', () => {
    const ids = new Set(FAMILY.map((n) => n.id));
    expect(ids.size).toBe(FAMILY.length);
    for (const n of FAMILY) if (n.parent) expect(ids.has(n.parent), n.id).toBe(true);
  });
});
