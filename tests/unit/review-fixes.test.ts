// Regression tests for the issues found in the Codex second-opinion review (2026-10-16).
import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { newId, STYLE_PRESETS } from '../../src/model/defaults'
import { migrate, MockupFileError } from '../../src/model/schema'
import type { Placement } from '../../src/model/types'
import { createStore } from '../../src/store/store'

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const roundTrip = (m: unknown) => migrate(JSON.parse(JSON.stringify(m)))

function mount() {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS.crew.make())
  mountEditor(root, store)
  const panel = () => root.querySelector<HTMLElement>('.inspector > div:not([hidden])')!
  const btn = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!
  return { root, store, panel, btn }
}

const text = (id: string, view = 0): Placement => ({
  id,
  view,
  content: { type: 'text', text: 'X', font: 'arimo', color: { hex: '#000000' } },
  x: 10,
  y: 10,
  scale: 1,
  rotation: 0,
  clip: true,
})

describe('limits: an editor-made mockup must always reload', () => {
  it('a 41st spec row is refused instead of producing an invalid draft', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    for (let i = 0; i < 60; i++) store.dispatch({ type: 'addSpec', row: { id: newId('spec'), label: '', value: 'v', visible: true } })
    expect(store.get().header.specs).toHaveLength(40)
    expect(() => roundTrip(store.get())).not.toThrow()
  })

  it('placements stop at 100, counting mirrored copies', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    for (let i = 0; i < 80; i++) store.dispatch({ type: 'addPlacement', placement: text(`p${i}`, 2), mirrorId: `m${i}` })
    expect(store.get().placements).toHaveLength(100)
    expect(() => roundTrip(store.get())).not.toThrow()
  })
})

describe('stale panel state (palette buttons)', () => {
  it('rename a colour, then add one: the name survives', () => {
    const { store, panel } = mount()
    store.dispatch({ type: 'setHeader', patch: { palette: { show: true, rows: [{ name: '', hex: '#862633', cmyk: '' }] } } })
    store.dispatch({ type: 'setHeader', patch: {} }) // nothing selected yet; open the header editor:
    document.querySelector('.sheet [data-field="title"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.querySelector<HTMLInputElement>('.inline-edit')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    const name = panel().querySelector<HTMLInputElement>('input[aria-label="Palette name"]')!
    name.focus()
    name.value = 'Garnet'
    name.dispatchEvent(new Event('input'))
    // Click "+ Add colour" without the panel rebuilding in between (focus is still in the input).
    ;[...panel().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '+ Add colour')!.click()
    expect(store.get().header.palette.rows.map((r) => r.name)).toEqual(['Garnet', ''])
  })
})

describe('undo/redo buttons follow gestures', () => {
  it('after typing the client name, Undo becomes enabled without any other change', () => {
    const { root, btn } = mount()
    const input = root.querySelector<HTMLInputElement>('.panel--inspector input[placeholder^="e.g."]')!
    input.focus()
    input.value = 'Mount Allison'
    input.dispatchEvent(new Event('input'))
    input.blur()
    expect(btn('↶ Undo').disabled).toBe(false)
  })
})

describe('inline edit after selecting the header', () => {
  it('the edit box is measured against the live element, not one the re-render removed', () => {
    const { root } = mount()
    const live = () => root.querySelector('.sheet [data-field="title"]')!
    // Give the title a position; jsdom has no layout, so stub it on whatever element is live.
    const proto = Object.getPrototypeOf(live())
    const orig = proto.getBoundingClientRect
    proto.getBoundingClientRect = function (this: Element) {
      return this.isConnected ? { left: 400, top: 60, width: 200, height: 30, right: 600, bottom: 90, x: 400, y: 60, toJSON() {} } : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }
    }
    try {
      live().dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const box = root.querySelector<HTMLInputElement>('.inline-edit')!
      expect(parseFloat(box.style.left)).toBeGreaterThan(300)
    } finally {
      proto.getBoundingClientRect = orig
    }
  })
})

describe('file validation: ids, mirror links, embedded images', () => {
  const base = () => JSON.parse(JSON.stringify(STYLE_PRESETS.crew.make()))

  it('rejects duplicate placement ids and duplicate spec ids', () => {
    const m = base()
    m.placements = [text('a'), text('a')]
    expect(() => migrate(m)).toThrow(MockupFileError)
    const n = base()
    n.header.specs[1].id = n.header.specs[0].id
    expect(() => migrate(n)).toThrow(MockupFileError)
  })

  it('rejects dangling, self, chained and multi-partner mirror links', () => {
    for (const placements of [
      [{ ...text('a'), mirrorOf: 'ghost' }],
      [{ ...text('a'), mirrorOf: 'a' }],
      [text('a'), { ...text('b'), mirrorOf: 'a' }, { ...text('c'), mirrorOf: 'b' }],
      [text('a'), { ...text('b'), mirrorOf: 'a' }, { ...text('c'), mirrorOf: 'a' }],
    ]) {
      const m = base()
      m.placements = placements
      expect(() => migrate(m)).toThrow(MockupFileError)
    }
    const ok = base()
    ok.placements = [text('a', 2), { ...text('b', 3), mirrorOf: 'a' }]
    expect(() => migrate(ok)).not.toThrow()
  })

  it('rejects embedded images whose bytes are not base64 or not the declared type', () => {
    for (const dataUrl of [
      'data:image/png;base64,',
      'data:image/png;base64,!!!not base64!!!',
      'data:image/png;base64,/9j/4AAQSkZJRgABAQ==', // a JPEG labelled as PNG
      `data:image/svg+xml;base64,${btoa('<html><script>alert(1)</script></html>')}`,
    ]) {
      const m = base()
      m.assets.l = { name: 'l', mime: dataUrl.slice(5, dataUrl.indexOf(';')), dataUrl }
      expect(() => migrate(m), dataUrl.slice(0, 40)).toThrow(MockupFileError)
    }
    const ok = base()
    ok.assets.l = { name: 'l.png', mime: 'image/png', dataUrl: PNG_1PX }
    expect(() => migrate(ok)).not.toThrow()
  })
})

describe('inline edit covers spec labels and palette text', () => {
  it('clicking a spec label edits the label, not the value', () => {
    const { root, store } = mount()
    store.dispatch({ type: 'setHeader', patch: { columns: 2 } })
    store.dispatch({ type: 'updateSpec', id: store.get().header.specs[0].id, patch: { label: 'Sizes' } })
    const id = store.get().header.specs[0].id
    root.querySelector(`.sheet [data-field="spec-label:${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const box = root.querySelector<HTMLInputElement>('.inline-edit')!
    expect(box.value).toBe('Sizes')
    box.value = 'Size range'
    box.dispatchEvent(new Event('input'))
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(store.get().header.specs[0]).toMatchObject({ label: 'Size range', value: 'Crew - Fully cushioned footbed' })
  })

  it('palette names and CMYK can be clicked and edited', () => {
    const { root, store } = mount()
    store.dispatch({ type: 'setHeader', patch: { palette: { show: true, rows: [{ name: 'Garnet', hex: '#862633', cmyk: '' }] } } })
    for (const [field, value, key] of [['pal-name:0', 'Mount A Garnet', 'name'], ['pal-cmyk:0', '0C 100M 65Y 34K', 'cmyk']] as const) {
      root.querySelector(`.sheet [data-field="${field}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const box = root.querySelector<HTMLInputElement>('.inline-edit')!
      box.value = value
      box.dispatchEvent(new Event('input'))
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(store.get().header.palette.rows[0][key]).toBe(value)
    }
  })
})

describe('sock style switch', () => {
  it('takes the style defaults, keeps the client design, and is one undo step', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'setZoneColor', zone: 'leg', color: { hex: '#862633' } })
    store.dispatch({ type: 'setHeader', patch: { client: 'Mount Allison' } })
    store.dispatch({ type: 'addPlacement', placement: text('p') })
    const before = store.get()
    store.dispatch({ type: 'applyStyle', style: STYLE_PRESETS['ankle-tab-grip'].make() })
    const m = store.get()
    expect(m.template).toBe('ankle-tab')
    expect(m.views.map((v) => v.kind)).toEqual(['front', 'back', 'left', 'right'])
    expect(m.patterns.gripDots?.onBack).toBe(true)
    expect(m.header.columns).toBe(2)
    expect(m.zones.leg.hex).toBe('#862633')
    expect(m.header.client).toBe('Mount Allison')
    expect(m.placements).toHaveLength(1)
    expect(() => roundTrip(m)).not.toThrow()
    store.undo()
    expect(store.get()).toBe(before)
  })
})
