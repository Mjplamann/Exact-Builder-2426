// Accessibility gate for CI: serves the built site (dist/) with `vite preview`, then
//   * scans every route in light and dark mode with axe-core (WCAG 2.x A/AA) and fails on any
//     serious or critical violation,
//   * checks that the skip link moves focus to the main content without changing location.hash
//     (the app uses hash routing, so a plain #main href would navigate away),
//   * checks that document.title differs per view.
//
//   npx vite build && node tests/a11y/axe-scan.mjs
//
// Locally, set CHROMIUM_PATH to use an existing Chromium (e.g. /opt/pw-browsers/chromium).
import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const ROUTES = [
  '#/',
  '#/map',
  '#/map?geo=county:27053',
  '#/trends',
  '#/trends?geo=county:27109',
  '#/pathogens',
  '#/pathogens/influenza',
  '#/pathogens/rhino-entero',
  '#/pathogens/measles',
  '#/pathogens/norovirus',
  '#/pathogens/lyme',
  '#/learn',
  '#/sources',
]
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING = new Set(['serious', 'critical'])

async function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, () => {
      const p = srv.address().port
      srv.close(() => resolve(p))
    })
  })
}

async function serve() {
  const port = await freePort()
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true })
  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      const r = await fetch(`http://localhost:${port}/`)
      if (r.ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not start (run `npx vite build` first)')
    await new Promise((r) => setTimeout(r, 300))
  }
  return {
    base: `http://localhost:${port}/`,
    stop: () => {
      try {
        process.kill(-server.pid)
      } catch {
        server.kill()
      }
    },
  }
}

const failures = []
const { base, stop } = await serve()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  // 1) axe in light and dark.
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: theme })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => failures.push(`${theme} page error: ${e.message}`))
    for (const r of ROUTES) {
      await page.goto(base + r, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      const res = await new AxeBuilder({ page }).withTags(TAGS).analyze()
      const bad = res.violations.filter((v) => BLOCKING.has(v.impact ?? ''))
      const summary = res.violations.map((v) => `${v.id}[${v.impact}](${v.nodes.length})`).join(', ') || 'none'
      console.log(`${theme.padEnd(5)} ${r.padEnd(28)} ${summary}`)
      for (const v of bad) {
        const where = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')
        failures.push(`${theme} ${r}: ${v.id} (${v.impact}, ${v.nodes.length} node(s)) — ${v.help} — e.g. ${where}`)
      }
    }
    await ctx.close()
  }

  // 2) Skip link and per-view titles.
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  const titles = new Map()
  for (const r of ROUTES) {
    await page.goto(base + r, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    const path = r.split('?')[0]
    if (!titles.has(path)) titles.set(path, await page.title())
  }
  const seen = new Map()
  for (const [path, title] of titles) {
    if (!title) failures.push(`${path}: empty document.title`)
    else if (seen.has(title)) failures.push(`${path} and ${seen.get(title)} share document.title "${title}"`)
    else seen.set(title, path)
  }
  for (const r of ['#/', '#/map?geo=county:27053', '#/trends', '#/pathogens/measles']) {
    await page.goto(base + r, { waitUntil: 'networkidle' })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const before = await page.evaluate(() => location.hash)
    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => ({
      text: (document.activeElement?.textContent ?? '').trim(),
      href: document.activeElement?.getAttribute('href') ?? '',
    }))
    if (!/skip/i.test(first.text)) {
      failures.push(`${r}: first Tab stop is "${first.text.slice(0, 40)}", not a skip link`)
      continue
    }
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => ({
      hash: location.hash,
      inMain: !!document.activeElement?.closest('main') || document.activeElement?.tagName === 'MAIN',
    }))
    if (after.hash !== before) failures.push(`${r}: skip link changed location.hash from "${before}" to "${after.hash}"`)
    if (!after.inMain) failures.push(`${r}: skip link did not move focus into <main>`)
  }
  await ctx.close()
} finally {
  await browser.close()
  stop()
}

if (failures.length) {
  console.error(`\n${failures.length} accessibility failure(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nAccessibility checks passed.')
