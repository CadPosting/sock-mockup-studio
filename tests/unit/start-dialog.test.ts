import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { OPEN_ERRORS, readMockupFile } from '../../src/editor/start-dialog'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { createStore } from '../../src/store/store'

function setup() {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS.crew.make())
  const editor = mountEditor(root, store)
  const dialog = () => root.querySelector<HTMLElement>('.start')
  const btn = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.startsWith(label))
  return { root, store, editor, dialog, btn }
}

const jsonFile = (data: unknown, name = 'mta.sockmockup.json') => new File([JSON.stringify(data)], name, { type: 'application/json' })

describe('main menu / start dialog (task 14)', () => {
  it('fresh browser: the menu shows the five styles and cannot be dismissed without choosing', () => {
    const { root, editor, dialog, btn } = setup()
    editor.openMenu({ canClose: false })
    expect(dialog()).not.toBeNull()
    expect([...root.querySelectorAll('.start__card-name')].map((n) => n.textContent)).toEqual(['Crew', 'Crew Grip', 'Dress Crew', 'Athletic Ankle', 'Ankle Tab Grip'])
    expect(btn('Back to current mockup')).toBeUndefined()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dialog()).not.toBeNull()
  })

  it('picking a style starts that style with a fresh history', () => {
    const { root, store, editor, dialog } = setup()
    editor.openMenu({ canClose: false })
    root.querySelector<HTMLButtonElement>('.start__card[data-style="ankle-tab-grip"]')!.click()
    expect(dialog()).toBeNull()
    expect(store.get().template).toBe('ankle-tab')
    expect(store.get().header.columns).toBe(2)
    expect(store.canUndo()).toBe(false)
  })

  it('a draft: "Resume" shows its client and restores it exactly', () => {
    const { root, store, editor, dialog, btn } = setup()
    store.dispatch({ type: 'setHeader', patch: { client: 'Mount Allison' } })
    const draft = store.get()
    editor.openMenu({ canClose: false, draft: { client: 'Mount Allison', savedAt: Date.now() - 5 * 60000 } })
    const resume = btn('Resume draft')!
    expect(resume.textContent).toBe('Resume draft — Mount Allison · edited 5 min ago')
    expect(document.activeElement).toBe(resume) // the obvious choice is focused
    resume.click()
    expect(dialog()).toBeNull()
    expect(store.get()).toBe(draft)
    expect(root.querySelector('.sheet')).not.toBeNull()
  })

  it('☰ Menu opens it from the editor; Esc or "Back" returns to the mockup unchanged', () => {
    const { store, dialog, btn } = setup()
    const before = store.get()
    btn('☰ Menu')!.click()
    expect(dialog()).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dialog()).toBeNull()
    btn('☰ Menu')!.click()
    btn('Back to current mockup')!.click()
    expect(store.get()).toBe(before)
  })

  it('with work on the sheet, a new style asks first; Cancel keeps the mockup', () => {
    const { root, store, dialog, btn } = setup()
    store.dispatch({ type: 'setZoneColor', zone: 'leg', color: { hex: '#862633' } })
    const before = store.get()
    btn('☰ Menu')!.click()
    root.querySelector<HTMLButtonElement>('.start__card[data-style="crew"]')!.click()
    expect(root.querySelector<HTMLElement>('.start__confirm')!.hidden).toBe(false)
    btn('Cancel')!.click()
    expect(store.get()).toBe(before)
    root.querySelector<HTMLButtonElement>('.start__card[data-style="dress-crew"]')!.click()
    btn('Replace it')!.click()
    expect(dialog()).toBeNull()
    expect(store.get().header.tag).toEqual({ mode: 'code', line1: 'HIP-CSC-05', line2: 'Dress Crew' })
  })

  it('editor shortcuts do nothing behind the open menu', () => {
    const { store, btn } = setup()
    store.dispatch({ type: 'setStripes', stripes: 2 })
    btn('☰ Menu')!.click()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    expect(store.get().stripes).toBe(2)
  })
})

describe('opening a mockup file', () => {
  it('a valid file round-trips', async () => {
    const m = STYLE_PRESETS['crew-grip'].make()
    m.header.client = 'Nutrio'
    const r = await readMockupFile(jsonFile(m))
    expect(r).toEqual({ ok: true, mockup: m })
  })

  it('bad files give the app-flow message and never throw', async () => {
    for (const f of [new File(['not json'], 'x.json'), jsonFile({ hello: 1 }), jsonFile({ ...STYLE_PRESETS.crew.make(), template: 'boot' })]) {
      expect(await readMockupFile(f)).toEqual({ ok: false, message: OPEN_ERRORS.damaged })
    }
    expect(await readMockupFile(jsonFile({ ...STYLE_PRESETS.crew.make(), version: 99 }))).toEqual({
      ok: false,
      message: 'This file was made by a newer version of the tool.',
    })
  })
})
