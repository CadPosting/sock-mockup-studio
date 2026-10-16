// Regression tests for the third Codex review (task 14a), 2026-10-16.
import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import type { Placement } from '../../src/model/types'
import { acrossProfiles } from '../../src/render/placements'
import { render } from '../../src/render/sheet'
import { createStore } from '../../src/store/store'

describe('hover/selection never repaints stroke-drawn stripes', () => {
  it('highlight classes skip the stripe strokes', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'setStripes', stripes: 1 })
    mountEditor(root, store)
    const stroke = root.querySelector('.sheet [data-view="2"] [data-zone="stripe1"][data-stroke]')!
    stroke.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    expect(stroke.classList.contains('is-hover')).toBe(false)
    expect(root.querySelector('.sheet [data-view="0"] [data-zone="stripe1"]')!.classList.contains('is-hover')).toBe(true)
  })
})

describe('sole edge on the side profiles', () => {
  it('a sole coloured differently shows on both profiles too, and Sole is in Layers on any view set', () => {
    const store = createStore(STYLE_PRESETS.crew.make()) // Front · Back · Left · Right (no Sole view)
    store.dispatch({ type: 'setZoneColor', zone: 'sole', color: { hex: '#000000' } })
    const svg = render(store.get())
    for (const v of ['2', '3']) expect(svg.querySelector(`[data-view="${v}"] [data-zone="sole"]`)).not.toBeNull()
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    mountEditor(root, store)
    expect(root.querySelector('.panel--layers [data-select="zone:sole"]')).not.toBeNull()
  })
})

describe('template switch keeps linked copies consistent', () => {
  it('after crew -> ankle, the Right copy is already where the ankle map puts it', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    const p: Placement = { id: 'a', view: 2, content: { type: 'text', text: 'X', font: 'arimo', color: { hex: '#000000' } }, x: 120, y: 200, scale: 1, rotation: 15, clip: true }
    store.dispatch({ type: 'addPlacement', placement: p, mirrorId: 'b' })
    for (const action of [{ type: 'setTemplate', template: 'ankle' } as const, { type: 'applyStyle', style: STYLE_PRESETS['athletic-ankle'].make() } as const]) {
      store.dispatch(action)
      const [left, right] = store.get().placements
      const expected = acrossProfiles('ankle', 'left', left, 3, 'b')
      expect(right.x).toBeCloseTo(expected.x, 6)
      expect(right.y).toBeCloseTo(expected.y, 6)
      expect(right.rotation).toBeCloseTo(expected.rotation, 6)
      // An unrelated edit no longer moves the copy.
      const before = { ...right }
      store.dispatch({ type: 'updatePlacement', id: 'a', patch: { content: { ...left.content, text: 'Y' } as Placement['content'] } })
      expect(store.get().placements[1].x).toBeCloseTo(before.x, 6)
    }
  })
})

describe('round 3b (Codex check of the fixes)', () => {
  it('with foot and sole both coloured, the sole strip is painted above the foot', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'setZoneColor', zone: 'foot', color: { hex: '#ff0000' } })
    store.dispatch({ type: 'setZoneColor', zone: 'sole', color: { hex: '#000000' } })
    const nodes = [...render(store.get()).querySelectorAll('[data-view="2"] [data-zone]')].map((n) => n.getAttribute('data-zone'))
    expect(nodes.indexOf('sole')).toBeGreaterThan(nodes.indexOf('foot'))
    expect(nodes.indexOf('heel')).toBeGreaterThan(nodes.indexOf('sole'))
  })

  it('a pair that is no longer Left/Right after a view change is unlinked, not silently resynced', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    const p: Placement = { id: 'a', view: 2, content: { type: 'text', text: 'X', font: 'arimo', color: { hex: '#000000' } }, x: 120, y: 200, scale: 1, rotation: 15, clip: true }
    store.dispatch({ type: 'addPlacement', placement: p, mirrorId: 'b' })
    store.dispatch({ type: 'setViews', views: [{ kind: 'front', label: 'F' }, { kind: 'back', label: 'B' }, { kind: 'left', label: 'L' }, { kind: 'left', label: 'L2' }] })
    expect(store.get().placements[1].mirrorOf).toBeUndefined()
    const before = { ...store.get().placements[1] }
    store.dispatch({ type: 'updatePlacement', id: 'a', patch: { x: 10 } })
    expect(store.get().placements[1]).toEqual(before)
  })
})

describe('panel clicks right after typing (found in Chrome during task 15)', () => {
  it('the first click on a font button after typing is not lost', async () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    ;[...root.querySelectorAll('button')].find((b) => b.textContent === '+ Text')!.click()
    const panel = root.querySelector('.panel--inspector')!
    const text = panel.querySelector<HTMLInputElement>('input[aria-label="Text"]')!
    text.focus()
    text.value = 'WESLEYAN'
    text.dispatchEvent(new Event('input'))
    // A real click: pointerdown on the button, the text box blurs, then pointerup + click.
    const oswald = [...panel.querySelectorAll<HTMLButtonElement>('.segmented__btn')].find((b) => b.textContent === 'Oswald')!
    oswald.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    text.blur()
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(oswald.isConnected).toBe(true) // not replaced before the click
    oswald.click()
    expect((store.get().placements[0].content as { font: string }).font).toBe('oswald')
    await new Promise((r) => setTimeout(r, 0))
    expect(panel.textContent).toContain('Oswald') // the panel caught up afterwards
  })
})

describe('round 4 (Codex review of task 15)', () => {
  it('a cancelled press does not leave the panel frozen', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    const panel = root.querySelector('.panel--inspector')!
    panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointercancel'))
    store.dispatch({ type: 'setHeader', patch: { client: 'After cancel' } })
    expect(panel.querySelector<HTMLInputElement>('input[placeholder^="e.g."]')!.value).toBe('After cancel')
  })

  it('Ctrl+E still exports while an inline edit box is open', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    const editor = mountEditor(root, store)
    let exported = 0
    editor.setExportHook(() => exported++)
    root.querySelector('.sheet [data-field="title"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.inline-edit')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }))
    expect(exported).toBe(1)
  })
})

describe('sheet clicks right after typing (found in Chrome during task 16)', () => {
  it('the first click on a sock part after typing selects it, even though the sheet redraws mid-click', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    const client = root.querySelector<HTMLInputElement>('.panel--inspector input[placeholder^="e.g."]')!
    client.focus()
    client.value = 'Mount Allison'
    client.dispatchEvent(new Event('input'))
    const cuff = root.querySelector('.sheet [data-view="0"] [data-zone="cuff"]')!
    cuff.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    client.blur() // ends the typing gesture -> the sheet redraws, the cuff element is replaced
    expect(cuff.isConnected).toBe(false)
    // The browser then fires click on what's left under the pointer (the sheet holder).
    root.querySelector('.sheet__svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelector('.inspector > div:not([hidden]) .inspector__title')!.textContent).toBe('Cuff')
  })
})

describe('sheet press when the browser sends no click (Chrome after a mid-press redraw)', () => {
  it('pointerdown + pointerup alone select the zone', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    const client = root.querySelector<HTMLInputElement>('.panel--inspector input[placeholder^="e.g."]')!
    client.focus()
    client.value = 'X'
    client.dispatchEvent(new Event('input'))
    root.querySelector('.sheet [data-view="1"] [data-zone="heel"]')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    client.blur()
    root.querySelector('.sheet [data-view="1"] [data-zone="heel"]')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    expect(root.querySelector('.inspector > div:not([hidden]) .inspector__title')!.textContent).toBe('Heel')
  })
})

describe('round 5 (Codex review of task 16)', () => {
  it('stroke-drawn bands (profile stripes, sole edge) are always a flat colour, so the PDF matches', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'setStripes', stripes: 2 })
    store.dispatch({ type: 'setZonePattern', zone: 'leg', pattern: { type: 'checks', color: { hex: '#000000' }, size: 8 } })
    store.dispatch({ type: 'setZoneColor', zone: 'sole', color: { hex: '#222222' } })
    store.dispatch({ type: 'setZonePattern', zone: 'sole', pattern: { type: 'dots', color: { hex: '#ffffff' }, size: 3, spacing: 9, style: 'solid' } })
    const strokes = [...render(store.get()).querySelectorAll('[data-stroke]')]
    expect(strokes.length).toBeGreaterThan(0)
    for (const s of strokes) expect(s.getAttribute('stroke')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('cuff stripes offer no pattern choice (too narrow to read, and the PDF could not draw it)', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'setStripes', stripes: 1 })
    mountEditor(root, store)
    root.querySelector('.sheet [data-view="0"] [data-zone="stripe1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelector('.panel--inspector select[aria-label="Pattern"]')).toBeNull()
  })

  it('after pressing a logo, a later plain click on empty sheet still deselects', async () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    ;[...root.querySelectorAll('button')].find((b) => b.textContent === '+ Text')!.click()
    const id = store.get().placements[0].id
    root.querySelector(`.sheet [data-placement="${id}"] text`)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await new Promise((r) => setTimeout(r, 0)) // a later click, not the press's own
    root.querySelector('.sheet__svg svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelector('.overlay__box')).toBeNull()
  })
})

describe('a click straight on a part wins over a stale press', () => {
  it('pointerdown on the heel with no pointerup, then a click on a spec line edits the spec', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    root.querySelector('.sheet [data-view="1"] [data-zone="heel"]')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    root.querySelector('.sheet [data-part="specs"] text')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelector('.inline-edit')).not.toBeNull()
  })
})
