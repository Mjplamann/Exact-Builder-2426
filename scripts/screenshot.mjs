#!/usr/bin/env node
/**
 * Headless visual check. Starts a Vite dev server, opens the app in Chromium (software WebGL),
 * lets it run, and saves screenshots + console errors.
 *
 *   node scripts/screenshot.mjs [--out .shots] [--wait 6] [--shots 1] [--interval 2]
 *                               [--width 1600] [--height 900] [--eval "js to run before shots"]
 *                               [--fresh]  (clear saved tank first)
 *                               [--hour 13] (pin tank time of day; 'real' to leave it)
 *                               [--prefix shot] (file name prefix)
 *
 * Exit code 1 if the page logged uncaught errors.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const out = resolve(opt('out', '.shots'));
const wait = Number(opt('wait', '6'));
const shots = Number(opt('shots', '1'));
const interval = Number(opt('interval', '2'));
const width = Number(opt('width', '1600'));
const height = Number(opt('height', '900'));
const evalJs = opt('eval', '');
const prefix = opt('prefix', 'shot');
const hour = opt('hour', '13');
mkdirSync(out, { recursive: true });

const candidates = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
const errors = [];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  logs.push(line);
  if (m.type() === 'error') errors.push(line);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

if (flag('fresh')) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
}
await page.goto(url, { waitUntil: 'load' });
if (hour !== 'real') {
  // Pin the tank clock to a time of day so lighting is comparable between runs.
  await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate((h) => {
    const app = window.__app;
    if (!app) return;
    const d = new Date(app.world.clock.simTime);
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    app.world.clock.simTime = d.getTime();
  }, Number(hour));
}
await page.waitForTimeout(wait * 1000);
if (evalJs) {
  try {
    const r = await page.evaluate(evalJs);
    if (r !== undefined) logs.push(`[eval] ${JSON.stringify(r)}`);
  } catch (e) {
    errors.push(`[eval] ${e.message}`);
  }
  await page.waitForTimeout(1500);
}
const files = [];
for (let i = 0; i < shots; i++) {
  const file = join(out, `${prefix}-${i}.png`);
  await page.screenshot({ path: file });
  files.push(file);
  if (i < shots - 1) await page.waitForTimeout(interval * 1000);
}
const stats = await page.evaluate(() => {
  const app = window.__app;
  if (!app) return null;
  const r = app.engine.renderer.info;
  return { fish: app.world.fish.length, food: app.world.food.length, decor: app.world.tank.decor.length, plants: app.world.tank.plants.length, calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
}).catch(() => null);
writeFileSync(join(out, `${prefix}-console.log`), logs.join('\n'));
await browser.close();
await server.close();
console.log(JSON.stringify({ files, stats, errors: errors.slice(0, 30), errorCount: errors.length }, null, 2));
process.exit(errors.length ? 1 : 0);
