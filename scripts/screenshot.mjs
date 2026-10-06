#!/usr/bin/env node
/**
 * Headless visual check. Starts a Vite dev server (no HMR/watch, private cache so concurrent
 * runs don't disturb each other), opens the app once in a fresh browser context (empty storage
 * → first-run preset), pins the tank clock, stops the live render loop and steps frames
 * deterministically with `__app.frame()` so captures work even when software WebGL renders at
 * a fraction of a frame per second.
 *
 *   node scripts/screenshot.mjs [--prefix shot] [--out .shots] [--hour 13]
 *        [--eval "<js>"]...           (run in order after boot; may return JSON-able values)
 *        [--advance 5]                (seconds of simulation without rendering before shots)
 *        [--frames 3] [--shots 1] [--interval-frames 20]
 *        [--width 1600 --height 900] [--mobile] [--landscape] [--live]  (--live keeps rAF running)
 *        [--query "gallery=tetra"]
 *
 * Exit code 1 if the page logged uncaught errors.
 */
import { createServer } from 'vite';
import { chromium, devices } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (n) => args.includes(`--${n}`);
const evals = args.flatMap((a, i) => (a === '--eval' ? [args[i + 1]] : []));
const out = resolve(opt('out', '.shots'));
const prefix = opt('prefix', 'shot');
const hour = opt('hour', '13');
const frames = Number(opt('frames', '3'));
const shots = Number(opt('shots', '1'));
const intervalFrames = Number(opt('interval-frames', '20'));
const advance = Number(opt('advance', '0'));
const live = flag('live');
mkdirSync(out, { recursive: true });

const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .filter(Boolean)
  .find((p) => existsSync(p));

const server = await createServer({
  root: resolve('.'),
  cacheDir: join(tmpdir(), `vite-shot-${process.pid}`),
  server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
  logLevel: 'error',
});
await server.listen();
const url = server.resolvedUrls.local[0] + (opt('query', '') ? `?${opt('query', '')}` : '');

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let ctxOpts = { viewport: { width: Number(opt('width', '1600')), height: Number(opt('height', '900')) } };
if (flag('mobile')) {
  const d = devices['iPhone 15 Pro Max'] ?? devices['iPhone 14 Pro Max'];
  ctxOpts = { ...d };
  if (flag('landscape')) ctxOpts.viewport = { width: d.viewport.height, height: d.viewport.width };
}
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
page.setDefaultTimeout(900_000);
const logs = [];
const errors = [];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  logs.push(line);
  if (m.type() === 'error') errors.push(line);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit', timeout: 900_000 });
await page.waitForFunction(() => !!window.__app, null, { timeout: 900_000, polling: 500 });
const bootMs = Date.now() - t0;

await page.evaluate(
  ({ h, live }) => {
    const app = window.__app;
    if (!live) app.stop();
    if (h !== 'real') {
      const d = new Date(app.world.clock.simTime);
      d.setHours(Math.floor(Number(h)), Math.round((Number(h) % 1) * 60), 0, 0);
      app.world.clock.simTime = d.getTime();
    }
  },
  { h: hour, live },
);
for (const e of evals) {
  try {
    const r = await page.evaluate(e);
    if (r !== undefined) logs.push(`[eval] ${typeof r === 'string' ? r : JSON.stringify(r)}`);
  } catch (err) {
    errors.push(`[eval] ${err.message}`);
  }
}
if (advance > 0) await page.evaluate((s) => window.__app.advance(s), advance);
// Settle smoothed lighting/exposure after pinning the clock or advancing (night/dawn staging).
if (!live) await page.evaluate(() => window.__app.settle?.());

const files = [];
for (let s = 0; s < shots; s++) {
  const n = s === 0 ? frames : intervalFrames;
  const ms = live
    ? (await page.waitForTimeout(n * 33), 0)
    : await page.evaluate((k) => {
        const t = performance.now();
        for (let i = 0; i < k; i++) window.__app.frame(1 / 30);
        return performance.now() - t;
      }, n);
  const file = join(out, `${prefix}-${s}.png`);
  await page.screenshot({ path: file, timeout: 900_000 });
  files.push(file);
  logs.push(`[frames] ${n} frames in ${Math.round(ms)} ms`);
}
const stats = await page
  .evaluate(() => {
    const app = window.__app;
    const r = app.engine.renderer.info;
    return { fish: app.world.fish.length, food: app.world.food.length, decor: app.world.tank.decor.length, plants: app.world.tank.plants.length, calls: r.render.calls, triangles: r.render.triangles, programs: r.programs?.length, textures: r.memory.textures };
  })
  .catch(() => null);
writeFileSync(join(out, `${prefix}-console.log`), logs.join('\n'));
await browser.close();
await server.close();
console.log(JSON.stringify({ files, bootMs, totalMs: Date.now() - t0, stats, evals: logs.filter((l) => l.startsWith('[eval]')), errors: errors.slice(0, 30), errorCount: errors.length }, null, 2));
process.exit(errors.length ? 1 : 0);
