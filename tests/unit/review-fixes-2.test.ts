// Regression tests for the second Codex review (start dialog, file checks), 2026-10-16.
import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { readMockupFile } from '../../src/editor/start-dialog'
import { sniffImageType } from '../../src/io/upload'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { migrate, MockupFileError } from '../../src/model/schema'
import { createStore } from '../../src/store/store'

function setup() {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS.crew.make())
  const editor = mountEditor(root, store)
  const btn = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.startsWith(label))
  return { root, store, editor, btn }
}

describe('start dialog: never lose work silently', () => {
  it('at boot with a restored draft, a new style still asks before replacing it', () => {
    const { root, store, editor } = setup()
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#862633' } })
    editor.openMenu({ canClose: false, draft: { client: '', savedAt: Date.now() } })
    root.querySelector<HTMLButtonElement>('.start__card[data-style="crew"]')!.click()
    expect(root.querySelector<HTMLElement>('.start__confirm')!.hidden).toBe(false)
    expect(store.get().zones.heel.hex).toBe('#862633')
  })

  it('edits to specs, title, tag or grip dots count as work too', () => {
    const { root, store, btn } = setup()
    store.dispatch({ type: 'updateSpec', id: store.get().header.specs[0].id, patch: { value: 'edited' } })
    btn('☰ Menu')!.click(); btn('New mockup…')!.click()
    root.querySelector<HTMLButtonElement>('.start__card[data-style="crew"]')!.click()
    expect(root.querySelector<HTMLElement>('.start__confirm')!.hidden).toBe(false)
  })

  it('an untouched style is replaced straight away (nothing to lose)', () => {
    const { root, store, btn } = setup()
    btn('☰ Menu')!.click(); btn('New mockup…')!.click()
    root.querySelector<HTMLButtonElement>('.start__card[data-style="dress-crew"]')!.click()
    expect(root.querySelector('.start')).toBeNull()
    expect(store.get().header.tag.mode).toBe('code')
  })

  it('only one menu at a time, and the editor behind it is inert', () => {
    const { root, btn } = setup()
    btn('☰ Menu')!.click(); btn('New mockup…')!.click()
    btn('☰ Menu')!.click(); btn('New mockup…')!.click()
    expect(root.querySelectorAll('.start')).toHaveLength(1)
    expect(root.querySelector('.workspace')!.hasAttribute('inert')).toBe(true)
    btn('Back to current mockup')!.click()
    expect(root.querySelector('.workspace')!.hasAttribute('inert')).toBe(false)
  })
})

describe('file and upload checks', () => {
  it('SVG with a doctype internal subset is a valid SVG', () => {
    const svg = '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n  <!ENTITY ns_svg "http://www.w3.org/2000/svg">\n]>\n<svg xmlns="&ns_svg;"/>'
    expect(sniffImageType(new TextEncoder().encode(svg))).toBe('image/svg+xml')
  })

  it('ids must be plain tokens (no quotes or spaces that could break selectors)', () => {
    const m = JSON.parse(JSON.stringify(STYLE_PRESETS.crew.make()))
    m.placements = [{ id: 'a"]x', view: 0, content: { type: 'text', text: 'X', font: 'arimo', color: { hex: '#000000' } }, x: 0, y: 0, scale: 1, rotation: 0, clip: true }]
    expect(() => migrate(m)).toThrow(MockupFileError)
  })

  it('opening a file whose image does not decode keeps the current mockup', async () => {
    const m = STYLE_PRESETS.crew.make()
    m.assets.l = { name: 'l.png', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } // signature only
    m.header.logoAssetId = 'l'
    const f = new File([JSON.stringify(m)], 'x.json')
    const r = await readMockupFile(f, async () => false)
    expect(r.ok).toBe(false)
  })

  it('a pending Open that finishes after the menu closed does nothing', async () => {
    const { root, store, btn } = setup()
    btn('☰ Menu')!.click(); btn('New mockup…')!.click()
    const input = root.querySelector<HTMLInputElement>('.start input[type="file"]')!
    const m = STYLE_PRESETS['crew-grip'].make()
    Object.defineProperty(input, 'files', { value: [new File([JSON.stringify(m)], 'late.json')] })
    input.dispatchEvent(new Event('change'))
    btn('Back to current mockup')!.click() // closed before the read finished
    const before = store.get()
    await new Promise((r) => setTimeout(r, 50))
    expect(store.get()).toBe(before)
  })
})
