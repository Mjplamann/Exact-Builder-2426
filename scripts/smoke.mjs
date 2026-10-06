#!/usr/bin/env node
/**
 * End-to-end smoke test in headless Chromium: exercises every AppApi feature and records
 * console errors / exceptions, plus a screenshot after each step.
 *
 *   node scripts/smoke.mjs [--out .shots/smoke] [--steps feed,decor,...] [--width 1280 --height 720]
 *
 * Exit code 1 when any step threw or the page logged errors.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const out = resolve(opt('out', '.shots/smoke'));
const only = opt('steps', '')?.split(',').filter(Boolean);
const width = Number(opt('width', '1280'));
const height = Number(opt('height', '720'));
mkdirSync(out, { recursive: true });

const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find((p) => existsSync(p));
const server = await createServer({ root: resolve('.'), cacheDir: join(tmpdir(), `vite-smoke-${process.pid}`), server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
page.setDefaultTimeout(900_000);

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

// Fresh browser context = empty storage = first-run preset. Navigate once only.
await page.goto(url, { waitUntil: 'commit', timeout: 900_000 });
await page.waitForFunction(() => !!window.__app, null, { timeout: 900_000, polling: 500 });
await page.evaluate(() => {
  const app = window.__app;
  const d = new Date(app.world.clock.simTime);
  d.setHours(13, 0, 0, 0);
  app.world.clock.simTime = d.getTime();
});
await page.evaluate(() => window.__app.stop());

/** Each step runs in the page; returns a JSON-able note. */
const STEPS = {
  baseline: () => ({ fish: window.__app.world.fish.length, species: window.__app.world.species.size, plants: window.__app.world.plants.all.length }),
  feed: async () => {
    const app = window.__app;
    const kinds = ['flakes', 'sinking-pellets', 'bloodworms', 'brine-shrimp', 'algae-wafers', 'micro-pellets'];
    for (const k of kinds) app.feed(k);
    return { food: app.world.food.length };
  },
  addFish: () => {
    const app = window.__app;
    const pool = app.world.species.search('', { water: app.world.tank.water });
    const picks = [];
    for (let i = 0; i < 12 && pool.length; i++) {
      const sp = pool[(i * 7919) % pool.length];
      app.addFish(sp.id, 2);
      picks.push(sp.id);
    }
    return { fish: app.world.fish.length, picks };
  },
  compat: () => {
    const app = window.__app;
    return app.world.species.all.slice(0, 50).map((s) => app.compatibility(s.id).level).reduce((a, l) => ((a[l] = (a[l] ?? 0) + 1), a), {});
  },
  decor: async () => {
    const app = window.__app;
    const { DECOR_CATALOG } = await import('/src/decor/catalog.ts');
    const items = [];
    DECOR_CATALOG.filter((d) => d.water.includes(app.world.tank.water)).forEach((d, i) => {
      const x = -0.4 + (i % 8) * 0.11;
      const z = -0.1 + Math.floor(i / 8) * 0.08;
      items.push(app.addDecor(d.kind, d.variant, [x, z]).id);
    });
    const first = items[0];
    if (first) {
      app.updateDecor(first, { rotation: [0, 1.2, 0], scale: 1.4 });
      app.removeDecor(items[items.length - 1]);
    }
    return { decor: app.world.tank.decor.length };
  },
  plants: () => {
    const app = window.__app;
    const list = app.world.plants.forWater(app.world.tank.water);
    list.forEach((p, i) => app.addPlant(p.id, [-0.5 + (i % 12) * 0.09, -0.15 + Math.floor(i / 12) * 0.06]));
    return { plants: app.world.tank.plants.length };
  },
  care: () => {
    const app = window.__app;
    app.waterChange(0.25);
    app.cleanGlass();
    app.trimPlants();
    app.setEquipment({ lights: { intensity: 0.6 }, heater: { targetC: 26 } });
    return app.world.tank.waterParams;
  },
  pick: () => {
    const app = window.__app;
    const r = [];
    for (let i = 0; i < 9; i++) r.push(app.pickAt(innerWidth * (0.2 + 0.075 * i), innerHeight * (0.3 + 0.06 * i)).kind);
    return r;
  },
  timeLapse: async () => {
    const app = window.__app;
    app.setTimeScale(10080);
    app.advance(20); // 20 real s at 1 min = 1 week → ~2.3 sim days
    app.setTimeScale(1);
    return { fish: app.world.fish.length, wp: app.world.tank.waterParams, journal: app.world.tank.journal.slice(-5) };
  },
  catchUp: () => {
    const app = window.__app;
    app.save();
    const t = JSON.parse(app.exportTank());
    t.lastSavedReal -= 3 * 86400000;
    app.importTank(JSON.stringify(t));
    return { fish: app.world.fish.length };
  },
  night: () => {
    const app = window.__app;
    const d = new Date(app.world.clock.simTime);
    d.setHours(23, 0, 0, 0);
    app.world.clock.simTime = d.getTime();
    return { hour: app.world.env.hour };
  },
  reef: () => {
    const app = window.__app;
    const d = new Date(app.world.clock.simTime);
    d.setHours(14, 0, 0, 0);
    app.loadPreset('reef');
    app.world.clock.simTime = d.getTime();
    return { fish: app.world.fish.length, decor: app.world.tank.decor.length, plants: app.world.tank.plants.length };
  },
  presets: () => {
    const app = window.__app;
    const ids = app.presets().map((p) => p.id);
    const out = {};
    for (const id of ids) {
      const t = performance.now();
      app.loadPreset(id);
      app.frame(1 / 30);
      out[id] = { ms: Math.round(performance.now() - t), fish: app.world.fish.length, decor: app.world.tank.decor.length, plants: app.world.tank.plants.length };
    }
    return out;
  },
  resize: () => {
    const app = window.__app;
    app.newTank({ size: { widthCm: 60, heightCm: 36, depthCm: 30 }, water: 'freshwater' });
    app.addFish(app.world.species.all.find((s) => s.water === 'freshwater').id, 5);
    return { fish: app.world.fish.length };
  },
  stress: () => {
    const app = window.__app;
    app.loadPreset(app.presets()[0].id);
    const pool = app.world.species.search('', { water: 'freshwater', maxLengthCm: 8 });
    for (let i = 0; i < 40; i++) app.addFish(pool[(i * 104729) % pool.length].id, 6);
    return { fish: app.world.fish.length };
  },
};

const results = [];
const names = only?.length ? only : Object.keys(STEPS);
for (const name of names) {
  const before = errors.length;
  let note;
  try {
    note = await page.evaluate(`(${STEPS[name].toString()})()`);
  } catch (e) {
    errors.push(`[step ${name}] ${e.message}`);
  }
  const t0 = Date.now();
  const frameMs = await page.evaluate(() => {
    const s = performance.now();
    for (let i = 0; i < 4; i++) window.__app.frame(1 / 30);
    return (performance.now() - s) / 4;
  });
  const file = join(out, `${name}.png`);
  await page.screenshot({ path: file, timeout: 900_000 });
  results.push({ step: name, note, newErrors: errors.slice(before), screenshot: file, avgFrameMs: Math.round(frameMs), waitMs: Date.now() - t0 });
}

writeFileSync(join(out, 'report.json'), JSON.stringify({ results, errors }, null, 2));
await browser.close();
await server.close();
console.log(JSON.stringify({ steps: results.map((r) => ({ step: r.step, errors: r.newErrors.length, frameMs: r.avgFrameMs })), errorCount: errors.length, firstErrors: errors.slice(0, 15) }, null, 2));
process.exit(errors.length ? 1 : 0);
