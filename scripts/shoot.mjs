// Visual QA helper: builds nothing — serves the existing dist/ with `vite preview` on a free port,
// then captures screenshots of hash routes in light/dark and desktop/phone sizes.
//
//   npx vite build && node scripts/shoot.mjs --out <dir> [--routes "#/,#/map"] [--phone] [--dark]
//
// Prints the PNG paths; open them with an image viewer (or the Read tool) to inspect.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const get = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const out = path.resolve(get('--out', 'pipeline/.cache/shots'))
const routes = get('--routes', '#/,#/map,#/trends,#/pathogens,#/pathogens/influenza,#/learn,#/sources').split(',')
const themes = args.includes('--dark') ? ['light', 'dark'] : ['light']
const sizes = args.includes('--phone')
  ? [{ name: 'desktop', width: 1366, height: 900 }, { name: 'phone', width: 390, height: 844 }]
  : [{ name: 'desktop', width: 1366, height: 900 }]
const fullPage = !args.includes('--viewport-only')
mkdirSync(out, { recursive: true })

const port = await new Promise((resolve) => {
  const srv = net.createServer().listen(0, () => {
    const p = srv.address().port
    srv.close(() => resolve(p))
  })
})
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true })
const deadline = Date.now() + 30_000
for (;;) {
  try {
    const res = await fetch(`http://localhost:${port}/`)
    if (res.ok) break
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) throw new Error('vite preview did not start')
  await new Promise((r) => setTimeout(r, 300))
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'],
})
const errors = []
try {
  for (const theme of themes) {
    for (const size of sizes) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: theme })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => errors.push(`${theme}/${size.name}: ${e.message}`))
      page.on('console', (m) => m.type() === 'error' && errors.push(`${theme}/${size.name} console: ${m.text()}`))
      for (const r of routes) {
        await page.goto(`http://localhost:${port}/${r}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(900)
        const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
        if (scrollW > size.width + 1) errors.push(`${theme}/${size.name} ${r}: horizontal overflow (${scrollW}px > ${size.width}px)`)
        const name = `${r.replace(/[#/?=&:]+/g, '_').replace(/^_|_$/g, '') || 'home'}-${size.name}-${theme}.png`
        const file = path.join(out, name)
        await page.screenshot({ path: file, fullPage })
        console.log(file)
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  try {
    process.kill(-server.pid)
  } catch {
    server.kill()
  }
}
if (errors.length) {
  console.log('\nISSUES:')
  for (const e of errors) console.log(' -', e)
}
