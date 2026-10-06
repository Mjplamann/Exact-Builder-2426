#!/usr/bin/env node
/**
 * Package the single-file build as a claude.ai Artifact page.
 *
 * The Artifact host wraps the published file in its own <!doctype>/<head>/<body> skeleton, so
 * this script takes dist-single/index.html (vite build --mode single) and emits only the page
 * content in the order the host expects: <title>, <style> blocks, body markup, then scripts.
 *
 *   npm run build:single && node scripts/build-artifact.mjs [--out dist-artifact/living-aquarium.html]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = resolve(outIdx >= 0 ? args[outIdx + 1] : 'dist-artifact/living-aquarium.html');
const html = readFileSync(resolve('dist-single/index.html'), 'utf8');

const take = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = (html.match(/<title>[\s\S]*?<\/title>/) ?? ['<title>Living Aquarium</title>'])[0];
const styles = take(/<style[\s\S]*?<\/style>/g);
const scripts = take(/<script[\s\S]*?<\/script>/g);
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) ?? [, ''])[1]
  // scripts are re-appended at the end
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

// The host skeleton pins a light color-scheme and an off-white body; this app is a deliberately
// dark, full-screen aquarium, so restate the dark scheme and ground explicitly.
const hostOverrides = `<style>:root{color-scheme:dark}html,body{height:100%;background:#02070a}</style>`;

const page = [title, hostOverrides, ...styles, body, ...scripts].join('\n');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
const size = Buffer.byteLength(page);
console.log(JSON.stringify({ out, bytes: size, mb: +(size / 1048576).toFixed(2), styles: styles.length, scripts: scripts.length, hasTitle: /<title>/.test(title) }));
if (size > 16 * 1024 * 1024) {
  console.error('Page exceeds the 16 MB artifact limit');
  process.exit(1);
}
