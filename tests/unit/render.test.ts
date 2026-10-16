import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { render } from '../../src/render/sheet'
import { createStore } from '../../src/store/store'

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
    // On every view now, side profiles included (14a).
    const views = (z: string) => new Set([...render(m).querySelectorAll(`[data-zone="${z}"]`)].map((n) => n.closest('[data-view]')!.getAttribute('data-view'))).size
    expect(views('stripe1')).toBe(4)
    expect(views('stripe2')).toBe(4)
    expect(views('band')).toBe(4)
    expect(count('stripe1')).toBeGreaterThanOrEqual(4)
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

describe('14a: ankle tab, profile zones, foot follows leg', () => {
  it('ankle-tab: taller cuff with a fold line on flat views, and a flap on both profiles', () => {
    const m = STYLE_PRESETS['ankle-tab-grip'].make()
    const svg = render(m)
    const front = svg.querySelector('[data-view="0"]')!
    expect(front.querySelector('[data-zone="cuff"]')!.getAttribute('d')).toBe('M0 284H176V335H0Z')
    expect([...front.querySelectorAll('path[stroke="#000000"]')].some((p) => p.getAttribute('d') === 'M0 309H176')).toBe(true)
    for (const v of ['2', '3']) expect(svg.querySelectorAll(`[data-view="${v}"] [data-zone="cuff"]`).length).toBe(2) // cuff + flap
    // Peter drew the ankle Right tab on its own, so it's his Right flap, not a mapped copy.
    expect(svg.querySelectorAll('[data-view="3"] [data-zone="cuff"]')[1].getAttribute('transform')).toBeNull()
  })

  it('no black lines around stripes or the mid band (Peter only outlines cuff, heel, toe)', () => {
    const m = STYLE_PRESETS.crew.make()
    m.stripes = 2
    m.midBand = true
    const svg = render(m)
    const lined = new Set([...svg.querySelectorAll('[data-view="0"] path[stroke="#000000"]')].map((p) => p.getAttribute('d')))
    const band = svg.querySelector('[data-view="0"] [data-zone="band"]')!.getAttribute('d')
    expect(lined.has(band)).toBe(false)
  })

  it('the foot follows the leg until it is given its own colour; then it shows on every view', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    const feet = () => render(store.get()).querySelectorAll('[data-zone="foot"]').length
    store.dispatch({ type: 'setZoneColor', zone: 'leg', color: { hex: '#862633' } })
    expect(store.get().zones.foot.hex).toBe('#862633')
    expect(store.get().zones.sole.hex).toBe('#862633')
    expect(feet()).toBe(0) // same as the leg: not drawn separately
    store.dispatch({ type: 'setZoneColor', zone: 'foot', color: { hex: '#000000' } })
    expect(feet()).toBe(4)
    store.dispatch({ type: 'setZoneColor', zone: 'leg', color: { hex: '#ffffff' } })
    expect(store.get().zones.foot.hex).toBe('#000000') // independent now
  })

  it('a leg pattern carries onto a following foot', () => {
    const store = createStore(STYLE_PRESETS['dress-crew'].make())
    store.dispatch({ type: 'setZonePattern', zone: 'leg', pattern: { type: 'argyle', color: { hex: '#862633' }, line: { hex: '#ffb81c' }, size: 40 } })
    expect(store.get().zoneFills.map((f) => f.zone).sort()).toEqual(['foot', 'leg', 'sole'])
    expect(render(store.get()).querySelectorAll('[data-zone="foot"]').length).toBe(0) // still looks the same
  })
})
