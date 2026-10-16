import { describe, expect, it } from 'vitest'
import { swatches } from '../../src/editor/color-field'
import { checkLogoFile, MAX_LOGO_BYTES, sniffImageType, toDataUrl, UPLOAD_ERRORS } from '../../src/io/upload'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { migrate } from '../../src/model/schema'
import { renderHeader, tagY } from '../../src/render/header'
import { createStore } from '../../src/store/store'
import { extractPalette } from '../../src/util/palette'

const bytes = (...b: number[]) => new Uint8Array(b)
const text = (s: string) => new TextEncoder().encode(s)
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const fileOf = (data: Uint8Array<ArrayBuffer>, name: string, type = 'image/png') => new File([data], name, { type })

describe('logo type check (magic bytes, not the file name)', () => {
  it('accepts PNG, JPEG and SVG by their content', () => {
    expect(sniffImageType(bytes(...PNG_SIG, 0, 0))).toBe('image/png')
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml')
    expect(sniffImageType(text('﻿<?xml version="1.0"?>\n<!-- Illustrator -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 1 1"/>'))).toBe('image/svg+xml')
  })

  it('rejects a Windows .exe renamed to .png, HTML, PDF, GIF and empty files', async () => {
    const exe = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03) // "MZ" header
    expect(sniffImageType(exe)).toBeNull()
    expect(await checkLogoFile(fileOf(exe, 'logo.png'))).toEqual({ ok: false, message: UPLOAD_ERRORS.type })
    expect(sniffImageType(text('<html><body><svg></svg></body></html>'))).toBeNull()
    expect(sniffImageType(text('%PDF-1.7'))).toBeNull()
    expect(sniffImageType(text('GIF89a'))).toBeNull()
    expect(sniffImageType(bytes())).toBeNull()
  })

  it('stores the sniffed type, not what the browser or file name claims', async () => {
    const r = await checkLogoFile(fileOf(bytes(0xff, 0xd8, 0xff, 0xdb, 1, 2), 'logo.png', 'image/png'))
    expect(r).toMatchObject({ ok: true, mime: 'image/jpeg' })
    if (r.ok) expect(r.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('rejects files over 10 MB before reading them', async () => {
    const big = new File([new Uint8Array(MAX_LOGO_BYTES + 1)], 'huge.png')
    expect(await checkLogoFile(big)).toEqual({ ok: false, message: UPLOAD_ERRORS.size })
  })

  it('data URLs round-trip and pass the file schema (large files too)', () => {
    const data = new Uint8Array(70_000).map((_, i) => i % 256) // > 2 chunks of 32 KB
    const url = toDataUrl(data, 'image/png')
    const back = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0))
    expect(back.length).toBe(data.length)
    expect(back.every((v, i) => v === data[i])).toBe(true)
    const m = STYLE_PRESETS.crew.make()
    m.assets.l = { name: 'l.png', mime: 'image/png', dataUrl: url, width: 10, height: 10, palette: ['#123456'] }
    m.header.logoAssetId = 'l'
    expect(() => migrate(JSON.parse(JSON.stringify(m)))).not.toThrow()
  })
})

describe('palette extraction', () => {
  const pixels = (...runs: [number, [number, number, number, number]][]) => {
    const out: number[] = []
    for (const [n, px] of runs) for (let i = 0; i < n; i++) out.push(...px)
    return new Uint8ClampedArray(out)
  }

  it('keeps the dominant colours, biggest first, and skips white, black and transparent', () => {
    const p = extractPalette(
      pixels(
        [2000, [255, 255, 255, 255]], // white background
        [500, [0, 0, 0, 255]], // black outline
        [800, [0, 0, 0, 0]], // transparent
        [600, [134, 38, 51, 255]], // garnet
        [300, [255, 184, 28, 255]], // gold
      ),
    )
    expect(p).toEqual(['#862633', '#ffb81c'])
  })

  it('merges near-identical shades (anti-aliasing) into one swatch, caps at 5', () => {
    const shades = Array.from({ length: 12 }, (_, i) => [50, [i * 20 + 10, 100, 200 - i * 10, 255]] as [number, [number, number, number, number]])
    const p = extractPalette(pixels([400, [31, 78, 140, 255]], [40, [33, 80, 142, 255]], ...shades))
    expect(p.length).toBeLessThanOrEqual(5)
    expect(p[0]).toBe('#1f4e8c')
    expect(p.filter((c) => c.startsWith('#2') || c.startsWith('#1f'))).toHaveLength(1)
  })
})

describe('logo in the mockup', () => {
  const PNG = toDataUrl(bytes(...PNG_SIG), 'image/png')

  it('setLogo adds the asset and uses it in the header in one undo step', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'setLogo', id: 'logo-1', asset: { name: 'dwu.png', mime: 'image/png', dataUrl: PNG, width: 600, height: 90, palette: ['#1f4e8c'] } })
    expect(renderHeader(store.get()).querySelector('image')!.getAttribute('href')).toBe(PNG)
    expect(swatches(store.get())[0]).toBe('#1f4e8c') // logo colours come first
    store.undo()
    expect(store.get().header.logoAssetId).toBeUndefined()
    expect(store.get().assets).toEqual({})
  })

  it('SAMPLE tag moves up under a short, wide logo (DWU) and stays put otherwise (PYC)', () => {
    const m = STYLE_PRESETS.crew.make()
    expect(tagY(m)).toBe(171)
    m.assets.l = { name: 'l.png', mime: 'image/png', dataUrl: PNG, width: 600, height: 90 }
    m.header.logoAssetId = 'l'
    expect(tagY(m)).toBe(117)
    m.assets.l = { ...m.assets.l, width: 220, height: 110 }
    expect(tagY(m)).toBe(171)
  })
})
