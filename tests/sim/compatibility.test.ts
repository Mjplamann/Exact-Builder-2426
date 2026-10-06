import { describe, expect, it } from 'vitest';
import { makeTank, stock, SIZE_120 } from './helpers';

const sp = (t: ReturnType<typeof makeTank>, id: string) => t.world.species.get(id)!;

describe('compatibility & stocking', () => {
  it('flags a second betta', () => {
    const t = makeTank({});
    stock(t, 'betta-splendens-halfmoon-red', 1, { sex: 'male' });
    const r = t.sim.compatibility(t.world, sp(t, 'betta-splendens-halfmoon-red'));
    expect(r.level).toBe('bad');
    expect(r.issues.join(' ')).toMatch(/only one male/i);
  });

  it('flags the angelfish–neon predation risk both ways', () => {
    const withNeons = makeTank({ size: SIZE_120 });
    stock(withNeons, 'paracheirodon-innesi', 12);
    const a = withNeons.sim.compatibility(withNeons.world, sp(withNeons, 'pterophyllum-scalare'));
    expect(a.level).toBe('bad');
    expect(a.issues.join(' ')).toMatch(/neon tetras/);

    const withAngels = makeTank({ size: SIZE_120 });
    stock(withAngels, 'pterophyllum-scalare', 2);
    const b = withAngels.sim.compatibility(withAngels.world, sp(withAngels, 'paracheirodon-innesi'));
    expect(b.level).toBe('bad');
    expect(b.issues.join(' ')).toMatch(/angelfish .* will eat neon tetras/i);
  });

  it('peaceful community fish are good together', () => {
    const t = makeTank({ size: SIZE_120 });
    stock(t, 'paracheirodon-innesi', 12);
    stock(t, 'corydoras-panda', 6);
    const r = t.sim.compatibility(t.world, sp(t, 'trigonostigma-heteromorpha'));
    expect(r.level).toBe('good');
    expect(r.issues.some((i) => /groups/.test(i))).toBe(true); // friendly group-size advice
  });

  it('rejects the wrong water type, too-small tanks and fin-nipping risk', () => {
    const t = makeTank({});
    const marine = t.sim.compatibility(t.world, sp(t, 'amphiprion-ocellaris'));
    expect(marine.level).toBe('bad');
    expect(marine.issues[0]).toMatch(/marine/);
    const nano = makeTank({ size: { widthCm: 45, heightCm: 30, depthCm: 30 } });
    const discus = nano.sim.compatibility(nano.world, sp(nano, 'symphysodon-aequifasciatus'));
    expect(discus.level).toBe('bad');
    expect(discus.issues.join(' ')).toMatch(/at least 250 L/);
  });

  it('stocking grows with adult size and fills up', () => {
    const t = makeTank({ size: SIZE_120 });
    const empty = t.sim.stocking(t.world);
    expect(empty.bioload).toBe(0);
    expect(empty.capacity).toBeGreaterThan(200);
    stock(t, 'paracheirodon-innesi', 20);
    const neons = t.sim.stocking(t.world).bioload;
    stock(t, 'pterophyllum-scalare', 1);
    const withAngel = t.sim.stocking(t.world).bioload;
    expect(withAngel - neons).toBeGreaterThan(neons / 20 * 8); // one angelfish ≫ one neon
    for (let i = 0; i < 12; i++) stock(t, 'pterophyllum-scalare', 1);
    const full = t.sim.stocking(t.world);
    expect(full.ratio).toBeGreaterThan(1);
    expect(t.sim.compatibility(t.world, sp(t, 'pterophyllum-scalare')).issues.join(' ')).toMatch(/capacity|support/);
  });
});
