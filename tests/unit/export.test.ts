import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { exportFileName, exportSvg } from '../../src/io/export-png'
import { embeddedFontCss, facesFor } from '../../src/io/fonts'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { createStore } from '../../src/store/store'

describe('export file names', () => {
  it('client-template-sampleN, lowercased and slugged', () => {
    const m = STYLE_PRESETS.crew.make()
    m.header.client = 'Mount Allison University'
    expect(exportFileName(m, 'png')).toBe('mount-allison-university-crew-sample1.png')
    m.header.client = 'Université  Laval / Bookstore'
    m.header.tag = { mode: 'sample', n: 12 }
    expect(exportFileName(m, 'pdf')).toBe('universite-laval-bookstore-crew-sample12.pdf')
  })

  it('style code instead of SAMPLE n; no client falls back to "mockup"', () => {
    const m = STYLE_PRESETS['dress-crew'].make()
    expect(exportFileName(m, 'png')).toBe('mockup-crew-hip-csc-05.png')
  })
})

describe('embedded fonts', () => {
  it('Arimo always; Oswald / Baskerville only when a wordmark uses them', () => {
    const m = STYLE_PRESETS.crew.make()
    expect(facesFor(m).map((f) => `${f.family} ${f.weight}`)).toEqual(['Arimo 400', 'Arimo 700'])
    m.placements = [{ id: 'p', view: 0, content: { type: 'text', text: 'REWD', font: 'oswald', color: { hex: '#000000' } }, x: 0, y: 0, scale: 1, rotation: 0, clip: true }]
    expect(facesFor(m).map((f) => f.family)).toEqual(['Arimo', 'Arimo', 'Oswald'])
  })

  it('fonts are inlined as data URLs (an SVG in a canvas cannot load files)', async () => {
    const fakeWoff2 = async () => new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]).buffer
    const css = await embeddedFontCss(STYLE_PRESETS.crew.make(), fakeWoff2)
    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css).toContain("font-family:'Arimo';font-weight:700")
    expect(css).toContain('src:url(data:font/woff2;base64,d09GMgECAw==)')
    expect(css).not.toMatch(/url\((?!data:)/) // nothing external
  })
})

describe('exported SVG', () => {
  it('is a fresh render: no editor highlights, handles, drop box or edit boxes', async () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    // Put the editor in a busy state: hover + selection on the sheet.
    root.querySelector('.sheet [data-view="1"] [data-zone="heel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.sheet [data-view="2"] [data-zone="heel"]')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    expect(root.querySelectorAll('.sheet .is-selected').length).toBeGreaterThan(0)
    const svg = await exportSvg(store.get(), '/* fonts */')
    expect(svg).not.toMatch(/is-hover|is-selected|overlay|logo-drop|inline-edit/)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 1024 768"')
    expect(svg).toContain('<style>/* fonts */</style>')
  })
})
