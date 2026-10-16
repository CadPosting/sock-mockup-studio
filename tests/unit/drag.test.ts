import { describe, expect, it } from 'vitest'
import { placementBox, toSheet } from '../../src/editor/geometry'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { createStore } from '../../src/store/store'

/** Pretend the sheet is drawn at `zoom` with its top-left at (left, top) on screen. */
function fakeLayout(el: Element, zoom: number, left = 300, top = 80) {
  el.getBoundingClientRect = () => ({ left, top, width: 1024 * zoom, height: 768 * zoom, right: 0, bottom: 0, x: left, y: top, toJSON: () => ({}) })
}
// Sheet units -> screen pixels for the fake layout above.
const screen = (zoom: number, x: number, y: number, left = 300, top = 80) => ({ clientX: left + x * zoom, clientY: top + y * zoom })

const pointer = (type: string, at: { clientX: number; clientY: number }, extra: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, button: 0, ...at, ...extra })

function setup() {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS.crew.make())
  const editor = mountEditor(root, store)
  const overlay = root.querySelector('.overlay')!
  const btn = (label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === label)!
  return { root, store, editor, overlay, btn }
}

describe('pointer -> sheet coordinates', () => {
  it('maps screen pixels to sheet units at any zoom', () => {
    const el = document.createElement('div')
    for (const zoom of [0.5, 1, 1.37, 2]) {
      fakeLayout(el, zoom)
      const s = screen(zoom, 512, 384)
      expect(toSheet(el, s.clientX, s.clientY)).toEqual({ x: 512, y: 384 })
    }
  })
})

describe('placements in the editor (task 12)', () => {
  it('+ Text adds a wordmark on the last clicked view and selects it; on Left the copy appears on Right', () => {
    const { root, store, btn } = setup()
    root.querySelector('.sheet [data-view="2"] [data-zone="leg"]')!.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }))
    btn('+ Text').click()
    const [a, b] = store.get().placements
    expect(a).toMatchObject({ view: 2, content: { type: 'text', text: 'TEXT' } })
    expect(b).toMatchObject({ view: 3, mirrorOf: a.id })
    expect(root.querySelector('.overlay__box')).not.toBeNull()
  })

  it('a dragged logo lands where the pointer let go, at any zoom; one undo step per drag', () => {
    for (const zoom of [0.5, 1, 2]) {
      const { root, store, overlay, btn } = setup()
      fakeLayout(overlay, zoom)
      btn('+ Text').click() // on Front (view 0), centred at x 88, y 460 (sheet: 36 + 88 = 124, 460)
      const id = store.get().placements[0].id
      const startSheet = { x: 124, y: 460 }
      const endSheet = { x: 180.5, y: 612.25 }
      root.querySelector(`[data-placement="${id}"] text`)!.dispatchEvent(pointer('pointerdown', screen(zoom, startSheet.x, startSheet.y)))
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const x = startSheet.x + (endSheet.x - startSheet.x) * t
        const y = startSheet.y + (endSheet.y - startSheet.y) * t
        window.dispatchEvent(pointer('pointermove', screen(zoom, x, y)))
      }
      window.dispatchEvent(pointer('pointerup', screen(zoom, endSheet.x, endSheet.y)))
      const box = placementBox(store.get(), store.get().placements[0])
      expect(box.cx).toBeCloseTo(endSheet.x, 6)
      expect(box.cy).toBeCloseTo(endSheet.y, 6)
      // The click that follows a drag must not deselect it.
      root.querySelector('.sheet__svg')!.dispatchEvent(pointer('click', screen(zoom, endSheet.x, endSheet.y)))
      expect(root.querySelector('.overlay__box')).not.toBeNull()
      store.undo()
      expect(store.get().placements[0]).toMatchObject({ x: 88, y: 460 })
    }
  })

  it('corner handle scales, top handle rotates, Shift snaps to 15 degrees', () => {
    const { root, store, overlay, btn } = setup()
    fakeLayout(overlay, 1)
    btn('+ Text').click()
    const centre = { x: 124, y: 460 }
    const corner = root.querySelector('.overlay__handle[data-op="scale"]')!
    const b0 = placementBox(store.get(), store.get().placements[0])
    const c0 = { x: centre.x - b0.w / 2, y: centre.y - b0.h / 2 }
    corner.dispatchEvent(pointer('pointerdown', screen(1, c0.x, c0.y)))
    window.dispatchEvent(pointer('pointermove', screen(1, centre.x + (c0.x - centre.x) * 2, centre.y + (c0.y - centre.y) * 2)))
    window.dispatchEvent(pointer('pointerup', { clientX: 0, clientY: 0 }))
    expect(store.get().placements[0].scale).toBeCloseTo(2, 6)

    const rot = root.querySelector('.overlay__handle[data-op="rotate"]')!
    const top = { x: centre.x, y: centre.y - 50 }
    rot.dispatchEvent(pointer('pointerdown', screen(1, top.x, top.y)))
    // Pointer moved a little past 30 degrees clockwise around the centre.
    const a = (-90 + 33) * (Math.PI / 180)
    window.dispatchEvent(pointer('pointermove', screen(1, centre.x + 50 * Math.cos(a), centre.y + 50 * Math.sin(a)), { shiftKey: true }))
    window.dispatchEvent(pointer('pointerup', { clientX: 0, clientY: 0 }))
    expect(store.get().placements[0].rotation).toBe(30)
  })

  it('arrows nudge (Shift = 10), Delete removes, Ctrl+D duplicates; Esc deselects', () => {
    const { store, btn } = setup()
    btn('+ Text').click()
    const key = (key: string, extra: KeyboardEventInit = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }))
    key('ArrowRight')
    key('ArrowDown', { shiftKey: true })
    expect(store.get().placements[0]).toMatchObject({ x: 89, y: 470 })
    key('d', { ctrlKey: true })
    expect(store.get().placements).toHaveLength(2)
    expect(store.get().placements[1]).toMatchObject({ x: 101, y: 482 })
    key('Delete')
    expect(store.get().placements).toHaveLength(1)
    key('Escape')
    key('ArrowRight')
    expect(store.get().placements[0].x).toBe(89) // nothing selected: arrows do nothing
  })

  it('the overlay is a separate element: render() output never contains handles', () => {
    const { root, btn } = setup()
    btn('+ Text').click()
    expect(root.querySelector('.sheet__svg .overlay__handle')).toBeNull()
    expect(root.querySelector('.overlay .overlay__handle')).not.toBeNull()
  })

  it('panel edits text as one undo step and shows the mirrored link with Unlink', () => {
    const { root, store, btn } = setup()
    root.querySelector('.sheet [data-view="3"] [data-zone="leg"]')!.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }))
    btn('+ Text').click()
    const panel = root.querySelector('.panel--inspector')!
    const input = panel.querySelector<HTMLInputElement>('input[aria-label="Text"]')!
    input.focus()
    for (const v of ['R', 'RE', 'REWD']) {
      input.value = v
      input.dispatchEvent(new Event('input'))
    }
    input.blur()
    expect(store.get().placements.map((p) => (p.content as { text: string }).text)).toEqual(['REWD', 'REWD'])
    expect(panel.textContent).toContain('Mirrored on Left')
    store.undo()
    expect((store.get().placements[0].content as { text: string }).text).toBe('TEXT')
  })
})
