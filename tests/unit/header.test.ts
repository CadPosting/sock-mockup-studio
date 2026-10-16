import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { renderHeader, wrap } from '../../src/render/header'
import { hexToCmyk } from '../../src/util/color'

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const specTexts = (g: SVGGElement) =>
  [...g.querySelectorAll('[data-part="specs"] > text')].map((t) => t.textContent)

describe('header', () => {
  it('1-column specs start at x 400 with the title, 25 units apart', () => {
    const g = renderHeader(STYLE_PRESETS['athletic-ankle'].make())
    const rows = [...g.querySelectorAll('[data-part="specs"] > text tspan')]
    expect(rows.map((r) => r.getAttribute('x'))).toEqual(['400', '400', '400', '400'])
    expect(rows.map((r) => r.getAttribute('y'))).toEqual(['129', '154', '179', '204'])
  })

  it('hidden rows are left out, and 2 columns put the smaller half on the left', () => {
    const m = STYLE_PRESETS['ankle-tab-grip'].make() // 9 rows -> 4 | 5, like PYC
    let lefts = [...renderHeader(m).querySelectorAll('[data-part="specs"] > text > tspan:first-child')]
    expect(lefts.filter((t) => t.getAttribute('x') === '340')).toHaveLength(4)
    m.header.specs[0].visible = false
    lefts = [...renderHeader(m).querySelectorAll('[data-part="specs"] > text')]
    expect(lefts).toHaveLength(8)
    expect(specTexts(renderHeader(m)).join()).not.toContain('Yarn composition')
  })

  it('labels are underlined with a real line (svg2pdf drops text-decoration); values are not', () => {
    const m = STYLE_PRESETS['crew-grip'].make() // 8 labelled rows
    const g = renderHeader(m)
    const lines = [...g.querySelectorAll('[data-part="specs"] > line')]
    expect(lines).toHaveLength(8)
    expect(g.querySelector('[text-decoration]')).toBeNull()
    const label = g.querySelector(`[data-field="spec-label:${m.header.specs[0].id}"]`)!
    expect(label.textContent).toBe('Yarn composition')
    expect(lines[0].getAttribute('x1')).toBe(label.getAttribute('x'))
    // 1-column specs without labels (DWU style) get no underline at all.
    expect(renderHeader(STYLE_PRESETS.crew.make()).querySelectorAll('[data-part="specs"] > line')).toHaveLength(0)
  })

  it('wraps long 2-column values the way PYC does', () => {
    expect(wrap('organic combed cotton, polyamide, elastane', 248, 15, 136)).toEqual([
      'organic combed',
      'cotton, polyamide, elastane',
    ])
  })

  it('SAMPLE tag and style-code tag', () => {
    const m = STYLE_PRESETS.crew.make()
    m.header.tag = { mode: 'sample', n: 3 }
    expect(renderHeader(m).querySelector('[data-part="tag"]')!.textContent).toBe('SAMPLE 3')
    const code = STYLE_PRESETS['dress-crew'].make()
    expect(renderHeader(code).querySelector('[data-part="tag"]')!.textContent).toBe('HIP-CSC-05Dress Crew')
  })

  it('logo is an <image> with a data URL only when the asset exists', () => {
    const m = STYLE_PRESETS.crew.make()
    expect(renderHeader(m).querySelector('image')).toBeNull()
    m.assets.logo = { name: 'logo.png', mime: 'image/png', dataUrl: PNG_1PX }
    m.header.logoAssetId = 'logo'
    expect(renderHeader(m).querySelector('image')!.getAttribute('href')).toBe(PNG_1PX)
  })

  it('user text is never parsed as markup', () => {
    const m = STYLE_PRESETS.crew.make()
    m.header.title = '<script>alert(1)</script>'
    m.header.specs[0].value = '<img src=x onerror=alert(1)>'
    const g = renderHeader(m)
    expect(g.querySelector('script, img')).toBeNull()
    expect(g.textContent).toContain('<script>alert(1)</script>')
  })

  it('palette table: typed CMYK wins, otherwise approx. formula', () => {
    const m = STYLE_PRESETS.crew.make()
    m.header.palette = {
      show: true,
      rows: [
        { name: 'StFX Blue', hex: '#001b40', cmyk: '100C 60M 0Y 80K' },
        { name: 'Marigold', hex: '#d5a845', cmyk: '' },
      ],
    }
    const t = renderHeader(m).querySelector('[data-part="palette"]')!.textContent!
    expect(t).toContain('100C 60M 0Y 80K')
    expect(t).toContain('0R 27G 64B')
    expect(t).toContain('(approx.)')
    expect(hexToCmyk('#000000')).toEqual([0, 0, 0, 100])
  })
})
