// Security checks from TDD §8, run in Chrome under the real CSP (vite preview serves vercel.json's
// headers). Engineering-plan task 20; results are written up in SECURITY.md.
import { expect, type Page, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const EVIL = join(here, 'fixtures', 'evil-logo.svg')

/** Collects anything that would mean code ran or the CSP was broken. */
async function watch(page: Page) {
  const seen: string[] = []
  page.on('dialog', async (d) => {
    seen.push(`dialog: ${d.message()}`)
    await d.dismiss()
  })
  page.on('console', (m) => m.type() === 'error' && seen.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => seen.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))
  page.on('response', (r) => r.status() >= 400 && seen.push(`${r.status()} ${r.url()}`))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as { __csp: string[] }).__csp = [...((window as unknown as { __csp?: string[] }).__csp ?? []), `${e.violatedDirective} ${e.blockedURI}`]
    })
  })
  return {
    seen,
    async pwned() {
      return page.evaluate(() => ({ pwned: (window as unknown as { __pwned?: string }).__pwned ?? null, csp: (window as unknown as { __csp?: string[] }).__csp ?? [] }))
    },
  }
}

async function exportBoth(page: Page) {
  for (const item of ['Download PNG', 'Download PDF']) {
    await page.click('text=Export ▾')
    await Promise.all([page.waitForEvent('download'), page.click(`text=${item}`)])
  }
}

test('the live preview sends the security headers from vercel.json', async ({ request }) => {
  const r = await request.get('/')
  const csp = r.headers()['content-security-policy']
  for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"]) expect(csp).toContain(d)
  expect(r.headers()['x-content-type-options']).toBe('nosniff')
  expect(r.headers()['x-frame-options']).toBe('DENY')
  expect(r.headers()['referrer-policy']).toBe('no-referrer')
  expect(r.headers()['permissions-policy']).toContain('camera=()')
})

test('a malicious SVG logo (script, onload, javascript: iframe) never runs: upload, sheet, PNG, PDF', async ({ page }) => {
  const w = await watch(page)
  await page.goto('/')
  await page.click('.start__card[data-style="crew"]')
  await page.setInputFiles('input[type=file][accept^="image"]', EVIL)
  await expect(page.locator('.logo-field__name')).toHaveText('evil-logo.svg')
  await page.click('.sheet [data-view="2"] [data-zone="heel"]')
  await page.click('text=+ Logo')
  await page.click('.stage', { position: { x: 5, y: 5 } })
  await exportBoth(page)
  // The logo is only ever an <image> with a data URL, never markup in the page...
  expect(await page.locator('.sheet svg script, .sheet foreignObject, .sheet iframe').count()).toBe(0)
  // ...and the SVG actually stored was cleaned (checked directly, not just by "nothing ran",
  // which the image sandbox alone would also give).
  const stored = await page.evaluate(() => {
    const href = document.querySelector('.sheet [data-part="header"] image')!.getAttribute('href')!
    return atob(href.split(',')[1])
  })
  expect(stored).not.toMatch(/script|onload|foreignObject|iframe|javascript:/i)
  expect(stored).toContain('EVIL') // the artwork itself is kept
  expect(await w.pwned()).toEqual({ pwned: null, csp: [] })
  expect(w.seen).toEqual([])
})

test('a tampered mockup file: injected HTML in text shows as text; an HTML "image" is refused', async ({ page }) => {
  const w = await watch(page)
  await page.goto('/')
  await page.click('.start__card[data-style="crew"]')
  const m = await page.evaluate(() => JSON.parse(localStorage.getItem('x') ?? 'null'))
  void m
  // Build a valid file in the page from the app's own Save, then tamper with it.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:text-is("Save")')])
  const file = JSON.parse(readFileSync((await dl.path())!, 'utf8'))
  const evil = readFileSync(EVIL).toString('base64')
  file.assets = { evil: { name: 'x.svg', mime: 'image/svg+xml', dataUrl: `data:image/svg+xml;base64,${evil}` } }
  file.header.logoAssetId = 'evil'
  file.header.title = '<img src=x onerror="window.__pwned=\'title\'">Specs'
  file.header.specs[0].value = '<script>window.__pwned="spec"</script>'
  file.views[0].label = '"><svg onload="window.__pwned=\'label\'">'
  await page.click('button:text-is("Open")')
  await page.setInputFiles('input[type=file][accept^=".json"]', { name: 'tampered.sockmockup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.locator('.sheet [data-field="title"]')).toHaveText('<img src=x onerror="window.__pwned=\'title\'">Specs')
  await expect(page.locator('.sheet [data-field^="spec:"]').first()).toHaveText('<script>window.__pwned="spec"</script>')
  await exportBoth(page)
  expect(await w.pwned()).toEqual({ pwned: null, csp: [] })
  // An HTML page labelled as an SVG image is rejected whole: the mockup above stays.
  file.assets.evil = { name: 'x.svg', mime: 'image/svg+xml', dataUrl: `data:image/svg+xml;base64,${Buffer.from('<html><script>window.__pwned=1</script></html>').toString('base64')}` }
  await page.click('button:text-is("Open")')
  await page.setInputFiles('input[type=file][accept^=".json"]', { name: 'html.sockmockup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.locator('.toast--error').last()).toHaveText("This file isn't a Sock Mockup Studio file (or it's damaged).")
  await expect(page.locator('.sheet [data-field="title"]')).toContainText('Specs')
  expect(await w.pwned()).toEqual({ pwned: null, csp: [] })
  expect(w.seen.filter((s) => !s.includes('confirm'))).toEqual([])
})
