import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { render } from '../../src/render/sheet'

const heelFills = (svg: SVGSVGElement) =>
  [...svg.querySelectorAll<SVGPathElement>('[data-view]')].map((v) =>
    [...v.querySelectorAll('[data-zone="heel"]')].map((p) => p.getAttribute('fill')),
  )

describe('render', () => {
  it('draws 4 labelled views for the blank crew preset', () => {
    const svg = render(STYLE_PRESETS.crew.make())
    expect(svg.getAttribute('viewBox')).toBe('0 0 1024 768')
    expect(svg.querySelectorAll('[data-view]')).toHaveLength(4)
    expect([...svg.querySelectorAll('[data-part="label"]')].map((t) => t.textContent)).toEqual(['Front', 'Back', 'Left', 'Right'])
  })

  it('changing zones.heel recolours the heel in back, left and right, not front', () => {
    const m = STYLE_PRESETS.crew.make()
    m.zones.heel = { hex: '#7a1f2b' }
    const [front, back, left, right] = heelFills(render(m))
    expect(front).toEqual([])
    for (const view of [back, left, right]) expect(view).toEqual(['#7a1f2b'])
  })

  it('sole view shows heel cap and sole colour, no cuff', () => {
    const m = STYLE_PRESETS['crew-grip'].make()
    m.zones.sole = { hex: '#222222' }
    const sole = render(m).querySelector('[data-view="1"]')!
    expect(sole.querySelector('[data-zone="cuff"]')).toBeNull()
    expect(sole.querySelector('[data-zone="sole"]')!.getAttribute('fill')).toBe('#222222')
  })

  it('adds stripes and mid band only when switched on', () => {
    const m = STYLE_PRESETS.crew.make()
    const count = (z: string) => render(m).querySelectorAll(`[data-zone="${z}"]`).length
    expect(count('stripe1') + count('band')).toBe(0)
    m.stripes = 2
    m.midBand = true
    expect(count('stripe1')).toBe(2) // front + back
    expect(count('stripe2')).toBe(2)
    expect(count('band')).toBe(2)
  })

  it('mirrors the Right profile and keeps user labels as plain text', () => {
    const m = STYLE_PRESETS.crew.make()
    m.views[3].label = '<img src=x onerror=alert(1)>'
    const svg = render(m)
    // Only the sock drawing flips, not the whole view (so placements on it aren't mirrored).
    expect(svg.querySelector('[data-view="3"]')!.getAttribute('transform')).not.toContain('scale')
    expect(svg.querySelector('[data-view="3"] [data-part="sock"]')!.getAttribute('transform')).toContain('scale(-1 1)')
    expect(svg.querySelector('img')).toBeNull()
    expect(svg.querySelectorAll('[data-part="label"]')[3].textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
