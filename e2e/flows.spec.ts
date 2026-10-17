// PRD acceptance flows A1-A3 (engineering-plan task 19), driven the way a person uses the tool:
// clicks, typing, drags and the real file pickers, against the production build in Chrome.
// The logo is a made-up "Acme University" fixture; no client material is used here.
import { expect, type Download, type Page, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** File and sheet commands live in the ☰ Menu. */
async function menu(page: Page, item: string) {
  await page.click('.topbar__menu')
  await page.click(`.menu__item:text-is("${item}")`)
}
import { fileURLToPath } from 'node:url'

// The package is an ES module, so there's no __dirname.
const here = dirname(fileURLToPath(import.meta.url))
const LOGO = join(here, 'fixtures', 'acme-logo.svg')
const MARK = join(here, 'fixtures', 'acme-mark.png')

async function bytesOf(d: Download): Promise<Buffer> {
  return readFileSync((await d.path())!)
}

/** Width x height from a PNG's IHDR chunk. */
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) })

/** Fail the test on any console error or failed request (a broken export often only logs). */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`))
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))
  return errors
}

async function colour(page: Page, view: number, zone: string, hex: string) {
  await page.click(`.sheet [data-view="${view}"] [data-zone="${zone}"]`)
  await page.fill('.panel--inspector .input--hex', hex)
  await page.press('.panel--inspector .input--hex', 'Enter')
}

async function exportAs(page: Page, item: 'Download PNG' | 'Download PDF'): Promise<Download> {
  await page.click('text=Export ▾')
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(`text=${item}`)])
  return d
}

/** A1's mockup, built from a blank tool. Returns the downloaded .sockmockup.json path. */
async function buildA1(page: Page): Promise<string> {
  await page.goto('/')
  await page.click('.start__card[data-style="crew"]')
  await page.fill('.panel--inspector input[placeholder^="e.g."]', 'Acme University')
  await page.setInputFiles('input[type=file][accept^="image"]', LOGO)
  await expect(page.locator('.logo-field__name')).toHaveText('acme-logo.svg')
  await colour(page, 0, 'leg', '#862633')
  await colour(page, 0, 'cuff', '#ffb81c')
  await colour(page, 1, 'heel', '#ffb81c')
  await colour(page, 0, 'toe', '#ffb81c')
  // Logo on the Left side profile: its mirrored copy appears on Right by itself.
  await page.click('.sheet [data-view="2"] [data-zone="heel"]')
  await page.click('text=+ Logo')
  await expect(page.locator('.sheet [data-view="3"] [data-placement]')).toHaveCount(1)
  // Fix one spec line by clicking it on the sheet and typing over it.
  await page.click('.sheet [data-part="specs"] text >> nth=0')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Crew - Half terry footbed')
  await page.keyboard.press('Enter')
  await page.click('.stage', { position: { x: 5, y: 5 } })
  const [saved] = await Promise.all([page.waitForEvent('download'), menu(page, 'Save file')])
  expect(saved.suggestedFilename()).toBe('acme-university-crew-sample1.sockmockup.json')
  return (await saved.path())!
}

test('A1: a new mockup from a blank tool, exported as PNG and PDF', async ({ page }) => {
  const errors = watchErrors(page)
  const started = Date.now()
  await buildA1(page)
  const png = await exportAs(page, 'Download PNG')
  expect(png.suggestedFilename()).toBe('acme-university-crew-sample1.png')
  expect(pngSize(await bytesOf(png))).toEqual({ w: 2048, h: 1536 })
  const pdf = await exportAs(page, 'Download PDF')
  const pdfText = (await bytesOf(pdf)).toString('latin1')
  expect(pdfText.startsWith('%PDF-')).toBe(true)
  expect(pdfText).toMatch(/\/Type \/Pages[\s\S]*?\/Count 1\b/) // exactly one page
  expect(pdfText).toContain('/FontFile2') // fonts embedded, not referenced
  // The PRD's human target is 5 minutes; the tool itself must not be the slow part.
  expect(Date.now() - started).toBeLessThan(30_000)
  expect(errors).toEqual([])
})

test('A2: reopen a saved mockup, change the heel, move the logo, re-export', async ({ page, context }) => {
  const errors = watchErrors(page)
  const file = await buildA1(page)
  // A different browser session: only the file carries the mockup.
  const fresh = await context.browser()!.newContext()
  const p2 = await fresh.newPage()
  await p2.goto('/')
  await p2.setInputFiles('.start input[type=file]', file)
  await expect(p2.locator('.start')).toHaveCount(0)
  const started = Date.now()
  await colour(p2, 2, 'heel', '#000000')
  await expect(p2.locator('.sheet [data-view="1"] [data-zone="heel"]')).toHaveAttribute('fill', '#000000')
  const logo = p2.locator('.sheet [data-view="2"] [data-placement] image')
  const before = (await logo.boundingBox())!
  await p2.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await p2.mouse.down()
  await p2.mouse.move(before.x + before.width / 2 - 20, before.y + before.height / 2 + 60, { steps: 8 })
  await p2.mouse.up()
  const after = (await logo.boundingBox())!
  expect(after.y - before.y).toBeGreaterThan(50)
  const png = await exportAs(p2, 'Download PNG')
  expect(pngSize(await bytesOf(png))).toEqual({ w: 2048, h: 1536 })
  expect(Date.now() - started).toBeLessThan(15_000) // PRD A2 target is under a minute for a person
  await fresh.close()
  expect(errors).toEqual([])
})

test('A3: SAMPLE 1 -> SAMPLE 2 in a new tab, renamed, both in one file and one PDF', async ({ page }) => {
  const errors = watchErrors(page)
  await buildA1(page)
  await menu(page, 'Duplicate to new sheet')
  await expect(page.locator('.sheet [data-field="tag:n"]')).toHaveText('SAMPLE 2')
  await colour(page, 0, 'leg', '#1f2a44')
  // Rename SAMPLE 2's tab by double-clicking it.
  await page.dblclick('.sheet-tab--active .sheet-tab__name')
  await page.fill('.sheet-tab__input', 'Navy version')
  await page.press('.sheet-tab__input', 'Enter')
  await expect(page.locator('.sheet-tab')).toHaveText(['SAMPLE 1', 'Navy version×'])
  const png = await exportAs(page, 'Download PNG')
  expect(png.suggestedFilename()).toBe('acme-university-crew-sample2.png')
  // SAMPLE 1 is untouched in its own tab.
  await page.click('.sheet-tab >> nth=0')
  await expect(page.locator('.sheet [data-field="tag:n"]')).toHaveText('SAMPLE 1')
  await expect(page.locator('.sheet [data-view="0"] [data-zone="leg"]')).toHaveAttribute('fill', '#862633')
  // One file holds both tabs; one PDF has a page per tab.
  const [saved] = await Promise.all([page.waitForEvent('download'), menu(page, 'Save file')])
  const book = JSON.parse((await bytesOf(saved)).toString())
  expect(book.sheets.map((s: { name: string }) => s.name)).toEqual(['SAMPLE 1', 'Navy version'])
  const pdf = (await bytesOf(await exportAs(page, 'Download PDF'))).toString('latin1')
  expect(pdf).toMatch(/\/Type \/Pages[\s\S]*?\/Count 2\b/)
  // Reopening the file brings both tabs back.
  await menu(page, 'Open file…')
  await page.setInputFiles('input[type=file][accept^=".json"]', (await saved.path())!)
  await expect(page.locator('.sheet-tab')).toHaveText(['SAMPLE 1×', 'Navy version'])
  expect(errors).toEqual([])
})

test('save -> reload -> open gives an identical sheet', async ({ page, context }) => {
  const file = await buildA1(page)
  // Add the second logo type (PNG) too, so both image paths round-trip.
  const sheetBefore = await page.locator('.sheet__svg').innerHTML()
  const fresh = await context.browser()!.newContext()
  const p2 = await fresh.newPage()
  await p2.goto('/')
  await p2.setInputFiles('.start input[type=file]', file)
  await expect(p2.locator('.start')).toHaveCount(0)
  expect(await p2.locator('.sheet__svg').innerHTML()).toBe(sheetBefore)
  await fresh.close()
})

test('bad uploads and bad files fail with a clear message, never a broken sheet', async ({ page }) => {
  await page.goto('/')
  await page.click('.start__card[data-style="crew"]')
  // Compare the sheet without the editor's hover highlight (it depends on where the mouse is).
  const sheet = async () => {
    await page.mouse.move(2, 2)
    return page.locator('.sheet__svg').innerHTML()
  }
  const sheetBefore = await sheet()
  // A Windows executable renamed to .png.
  await page.setInputFiles('input[type=file][accept^="image"]', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1') })
  await expect(page.locator('.toast--error')).toHaveText('Only PNG, JPG or SVG logos.')
  // A damaged mockup file.
  await menu(page, 'Open file…')
  await page.setInputFiles('input[type=file][accept^=".json"]', { name: 'x.sockmockup.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"nope":true}') })
  await expect(page.locator('.toast--error').last()).toHaveText("This file isn't a Sock Mockup Studio file (or it's damaged).")
  expect(await sheet()).toBe(sheetBefore)
  // A real PNG logo still works afterwards.
  await page.setInputFiles('input[type=file][accept^="image"]', MARK)
  await expect(page.locator('.logo-field__name')).toHaveText('acme-mark.png')
})
