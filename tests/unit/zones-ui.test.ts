import { describe, expect, it } from 'vitest'
import { normalizeHex, swatches } from '../../src/editor/color-field'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { createStore } from '../../src/store/store'

const setup = (preset: keyof typeof STYLE_PRESETS = 'crew') => {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS[preset].make())
  mountEditor(root, store)
  const inspector = () => root.querySelector<HTMLElement>('.panel--inspector')!
  const heelOn = (view: number) => root.querySelector(`.sheet [data-view="${view}"] [data-zone="heel"]`)!
  return { root, store, inspector, heelOn }
}

const fills = (root: HTMLElement, zone: string) =>
  [...root.querySelectorAll(`.sheet [data-zone="${zone}"]`)].map((n) => n.getAttribute('fill'))

describe('zone selection + colour picker (task 10)', () => {
  it('click the heel on Left, pick a swatch: every heel changes; one undo restores them', () => {
    const { root, store, inspector, heelOn } = setup()
    store.dispatch({ type: 'setZoneColor', zone: 'cuff', color: { hex: '#7a1f2b' } }) // puts garnet in the swatch row
    heelOn(2).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(inspector().querySelector('.inspector > div:not([hidden]) .inspector__title')!.textContent).toBe('Heel')
    const garnet = inspector().querySelector<HTMLButtonElement>('.swatch[title="#7a1f2b"]')!
    garnet.click()
    expect(fills(root, 'heel')).toEqual(['#7a1f2b', '#7a1f2b', '#7a1f2b'])
    store.undo()
    expect(fills(root, 'heel')).toEqual(['#ffffff', '#ffffff', '#ffffff'])
  })

  it('hovering a zone highlights it on every view; leaving clears it', () => {
    const { root, heelOn } = setup()
    heelOn(3).dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    expect(root.querySelectorAll('.sheet [data-zone="heel"].is-hover')).toHaveLength(3)
    root.querySelector('.sheet')!.dispatchEvent(new MouseEvent('pointerleave'))
    expect(root.querySelectorAll('.sheet .is-hover')).toHaveLength(0)
  })

  it('selection stays highlighted across re-renders; Esc and empty clicks deselect', () => {
    const { root, store, inspector, heelOn } = setup()
    heelOn(1).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    store.dispatch({ type: 'setStripes', stripes: 1 }) // re-render
    expect(root.querySelectorAll('.sheet [data-zone="heel"].is-selected')).toHaveLength(3)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(inspector().querySelector('.hint')!.textContent).toContain('Click any part')
    heelOn(1).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.sheet svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelectorAll('.is-selected')).toHaveLength(0)
  })

  it('hex field accepts #rgb / rrggbb and rejects junk without changing the sock', () => {
    const { root, store, inspector, heelOn } = setup()
    heelOn(1).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const hex = inspector().querySelector<HTMLInputElement>('.input--hex')!
    hex.value = 'zzz'
    hex.dispatchEvent(new Event('change'))
    expect(store.get().zones.heel.hex).toBe('#ffffff')
    expect(hex.classList.contains('input--invalid')).toBe(true)
    hex.value = 'F80'
    hex.dispatchEvent(new Event('change'))
    expect(fills(root, 'heel')[0]).toBe('#ff8800')
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef')
  })

  it('factory ref is stored with the colour, and cleared when emptied', () => {
    const { store, inspector, heelOn } = setup()
    heelOn(1).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const ref = inspector().querySelector<HTMLInputElement>('input[aria-label="Colour factory reference"]')!
    ref.value = 'Pantone 202C'
    ref.dispatchEvent(new Event('change'))
    expect(store.get().zones.heel).toEqual({ hex: '#ffffff', ref: 'Pantone 202C' })
    const ref2 = inspector().querySelector<HTMLInputElement>('input[aria-label="Colour factory reference"]')!
    ref2.value = ''
    ref2.dispatchEvent(new Event('change'))
    expect(store.get().zones.heel).toEqual({ hex: '#ffffff' })
  })

  it('choosing a pattern applies it to that zone on every view, with its own controls', () => {
    const { root, store, inspector } = setup()
    root.querySelector('.sheet [data-view="0"] [data-zone="leg"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const select = inspector().querySelector<HTMLSelectElement>('select[aria-label="Pattern"]')!
    select.value = 'argyle'
    select.dispatchEvent(new Event('change'))
    expect(store.get().zoneFills[0]).toMatchObject({ zone: 'leg', pattern: { type: 'argyle' } })
    expect(fills(root, 'leg')).toEqual(Array(4).fill('url(#fill-leg)'))
    expect(inspector().textContent).toContain('Diamond colour')
    const again = inspector().querySelector<HTMLSelectElement>('select[aria-label="Pattern"]')!
    again.value = ''
    again.dispatchEvent(new Event('change'))
    expect(store.get().zoneFills).toEqual([])
  })

  it('Layers rows select zones; Dots adds grip dots and shows their panel; undo clears the selection', () => {
    const { root, store, inspector } = setup('crew-grip')
    root.querySelector<HTMLElement>('.panel--layers [data-select="zone:toe"]')!.click()
    expect(inspector().querySelector('.inspector > div:not([hidden]) .inspector__title')!.textContent).toBe('Toe')
    store.dispatch({ type: 'setGripDots', gripDots: null })
    ;[...root.querySelectorAll('button')].find((b) => b.textContent === 'Dots')!.click()
    expect(store.get().patterns.gripDots).not.toBeNull()
    expect(inspector().querySelector('.inspector > div:not([hidden]) .inspector__title')!.textContent).toBe('Grip dots')
    store.undo()
    expect(inspector().querySelector('.hint')!.textContent).toContain('Click any part')
  })

  it('swatches: brand palette first, then used colours, then basics, no duplicates', () => {
    const m = STYLE_PRESETS.crew.make()
    m.header.palette.rows = [{ name: 'Garnet', hex: '#862633', cmyk: '' }]
    m.zones.leg = { hex: '#FFB81C' }
    const s = swatches(m)
    expect(s.slice(0, 3)).toEqual(['#862633', '#ffffff', '#ffb81c'])
    expect(new Set(s).size).toBe(s.length)
    expect(s).toContain('#000000')
  })
})
