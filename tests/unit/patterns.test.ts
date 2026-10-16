import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { migrate, MockupFileError, PATTERN_TYPES } from '../../src/model/schema'
import type { ZonePattern } from '../../src/model/types'
import { render } from '../../src/render/sheet'

const c = (hex: string) => ({ hex })
const EXAMPLES: Record<(typeof PATTERN_TYPES)[number], ZonePattern> = {
  stripes: { type: 'stripes', color: c('#ff0000'), width: 4, gap: 4, angle: 0 },
  checks: { type: 'checks', color: c('#000000'), size: 8 },
  dots: { type: 'dots', color: c('#ffffff'), size: 4, spacing: 12, style: 'solid' },
  chevrons: { type: 'chevrons', color: c('#0000ff'), size: 14 },
  camo: { type: 'camo', colors: [c('#334433'), c('#776655')], size: 60 },
  argyle: { type: 'argyle', color: c('#862633'), line: c('#ffb81c'), size: 40 },
}

describe('zone pattern fills', () => {
  for (const type of PATTERN_TYPES) {
    it(`${type}: valid in a file, and the leg uses it in all 4 views`, () => {
      const m = STYLE_PRESETS.crew.make()
      m.zoneFills = [{ zone: 'leg', pattern: EXAMPLES[type] }]
      expect(() => migrate(JSON.parse(JSON.stringify(m)))).not.toThrow()
      const svg = render(m)
      expect(svg.querySelector('defs pattern#fill-leg')).not.toBeNull()
      const legs = [...svg.querySelectorAll('[data-zone="leg"]')].map((p) => p.getAttribute('fill'))
      expect(legs).toEqual(Array(4).fill('url(#fill-leg)'))
    })
  }

  it('the zone colour is the pattern base, so recolouring the zone still works', () => {
    const m = STYLE_PRESETS.crew.make()
    m.zones.leg = c('#123456')
    m.zoneFills = [{ zone: 'leg', pattern: EXAMPLES.checks }]
    expect(render(m).querySelector('#fill-leg > rect')!.getAttribute('fill')).toBe('#123456')
  })

  it('rejects two patterns on one zone and unknown pattern types', () => {
    const m = STYLE_PRESETS.crew.make()
    m.zoneFills = [
      { zone: 'leg', pattern: EXAMPLES.checks },
      { zone: 'leg', pattern: EXAMPLES.dots },
    ]
    expect(() => migrate(JSON.parse(JSON.stringify(m)))).toThrow(MockupFileError)
    const bad = JSON.parse(JSON.stringify(STYLE_PRESETS.crew.make()))
    bad.zoneFills = [{ zone: 'leg', pattern: { type: 'plaid', color: c('#000000') } }]
    expect(() => migrate(bad)).toThrow(MockupFileError)
  })
})

describe('grip dots and motif', () => {
  it('grip dots go on the sole view, and on the back only with onBack', () => {
    const m = STYLE_PRESETS['crew-grip'].make() // Front · Sole · Left · Right, dots on
    const where = () => [...render(m).querySelectorAll('[data-part="grip-dots"]')].map((d) => d.closest('[data-view]')!.getAttribute('data-view'))
    expect(where()).toEqual(['1'])
    m.views[1] = { kind: 'back', label: 'Back' }
    expect(where()).toEqual([])
    m.patterns.gripDots!.onBack = true
    expect(where()).toEqual(['1'])
  })

  it('motif appears only on the chosen views, unflipped, and is not click-to-edit', () => {
    const m = STYLE_PRESETS['dress-crew'].make()
    m.patterns.motif = { content: { type: 'text', text: 'X', font: 'baskerville', color: c('#ffffff') }, views: [0, 3], size: 30, spacing: 80 }
    const svg = render(m)
    const views = [...svg.querySelectorAll('[data-part="motif"]')].map((g) => g.closest('[data-view]')!.getAttribute('data-view'))
    expect(views).toEqual(['0', '3'])
    let node: Element | null = svg.querySelector('[data-view="3"] [data-part="motif"] text')
    expect(node!.hasAttribute('data-field')).toBe(false)
    // On the mirrored crew Right the sock group is flipped and each motif copy flips back:
    // an even number of horizontal flips above the glyph means it reads the right way round.
    let flips = 0
    for (; node; node = node.parentElement) flips += ((node.getAttribute('transform') ?? '').match(/scale\(-1 1\)/g) ?? []).length
    expect(flips % 2).toBe(0)
  })

  it('the motif sits under the cuff, heel and toe (only on leg and foot, like StFX)', () => {
    const m = STYLE_PRESETS['dress-crew'].make()
    m.patterns.motif = { content: { type: 'text', text: 'X', font: 'baskerville', color: c('#ffffff') }, views: [1], size: 30, spacing: 80 }
    const order = [...render(m).querySelectorAll('[data-view="1"] [data-part="motif"], [data-view="1"] [data-zone]')].map((n) => n.getAttribute('data-zone') ?? 'motif')
    for (const z of ['cuff', 'heel', 'toe']) expect(order.lastIndexOf(z)).toBeGreaterThan(order.indexOf('motif'))
  })
})
