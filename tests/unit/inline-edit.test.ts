import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { migrate } from '../../src/model/schema'
import { createStore } from '../../src/store/store'

function setup(preset: keyof typeof STYLE_PRESETS = 'crew') {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS[preset].make())
  mountEditor(root, store)
  const click = (sel: string, type = 'click') => root.querySelector(`.sheet ${sel}`)!.dispatchEvent(new MouseEvent(type, { bubbles: true }))
  const box = () => root.querySelector<HTMLInputElement>('.inline-edit')
  const typeInto = (value: string) => {
    const b = box()!
    b.value = value
    b.dispatchEvent(new Event('input'))
  }
  const key = (k: string) => box()!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  return { root, store, click, box, typeInto, key }
}

describe('click-to-edit text on the sheet (task 13b)', () => {
  it('title: click, type, Enter — the sheet updates live, and it is one undo step', () => {
    const { root, store, click, box, typeInto, key } = setup()
    click('[data-field="title"]')
    expect(box()!.value).toBe('Specifications')
    typeInto('Mount')
    expect(root.querySelector('.sheet [data-field="title"]')!.textContent).toBe('Mount') // live
    typeInto('Mount Allison - Key Specifications')
    key('Enter')
    expect(box()).toBeNull()
    expect(store.get().header.title).toBe('Mount Allison - Key Specifications')
    store.undo()
    expect(store.get().header.title).toBe('Specifications')
  })

  it('Esc cancels: everything is exactly as before, with no empty undo step', () => {
    const { store, click, typeInto, key, box } = setup()
    const before = store.get()
    click('[data-field="title"]')
    typeInto('oops')
    key('Escape')
    expect(box()).toBeNull()
    expect(store.get()).toBe(before)
    expect(store.canUndo()).toBe(false)
  })

  it('every kind of text on the six reference sheets can be edited by clicking it', () => {
    // Spec value
    let t = setup()
    const spec = t.store.get().header.specs[1]
    t.click(`[data-field="spec:${spec.id}"]`)
    t.typeInto('100% merino')
    t.key('Enter')
    expect(t.store.get().header.specs[1].value).toBe('100% merino')

    // View label
    t = setup()
    t.click('[data-field="label:2"]')
    t.typeInto('Left - outer')
    t.box()!.dispatchEvent(new Event('blur')) // clicking away keeps the edit
    expect(t.store.get().views[2].label).toBe('Left - outer')

    // SAMPLE number (only digits 1-999 accepted)
    t = setup()
    t.click('[data-field="tag:n"]')
    t.typeInto('4')
    t.key('Enter')
    expect(t.store.get().header.tag).toEqual({ mode: 'sample', n: 4 })

    // Style code lines (StFX)
    t = setup('dress-crew')
    t.click('[data-field="tag:line2"]')
    t.typeInto('Dress Crew Argyle')
    t.key('Enter')
    expect(t.store.get().header.tag).toEqual({ mode: 'code', line1: 'HIP-CSC-05', line2: 'Dress Crew Argyle' })

    // Text wordmark on the sock: double-click (single click selects/drags it)
    t = setup()
    ;[...t.root.querySelectorAll('button')].find((b) => b.textContent === '+ Text')!.click()
    const id = t.store.get().placements[0].id
    const press = () => t.click(`[data-field="placement:${id}"]`, 'pointerdown')
    press()
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(t.box()).toBeNull() // one press selects/drags
    press() // second press on the same wordmark within 400 ms = edit
    t.typeInto('REWD')
    t.key('Enter')
    expect(t.store.get().placements.map((p) => (p.content as { text: string }).text)).toEqual(['REWD'])
    expect(() => migrate(JSON.parse(JSON.stringify(t.store.get())))).not.toThrow()
  })

  it('a mirrored wordmark edits both sides; keys typed in the box do not move or delete the logo', () => {
    const { root, store, click, typeInto, key, box } = setup()
    click('[data-view="2"] [data-zone="heel"]', 'pointerdown')
    ;[...root.querySelectorAll('button')].find((b) => b.textContent === '+ Text')!.click()
    const id = store.get().placements[0].id
    click(`[data-field="placement:${id}"]`, 'pointerdown')
    window.dispatchEvent(new MouseEvent('pointerup'))
    click(`[data-field="placement:${id}"]`, 'pointerdown')
    const before = store.get().placements[0]
    box()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    box()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    expect(store.get().placements).toHaveLength(2)
    expect(store.get().placements[0].x).toBe(before.x)
    typeInto('DWU')
    key('Enter')
    expect(store.get().placements.map((p) => (p.content as { text: string }).text)).toEqual(['DWU', 'DWU'])
  })

  it('the edit box is editor-only: never inside the rendered SVG', () => {
    const { root, click } = setup()
    click('[data-field="title"]')
    expect(root.querySelector('.sheet__svg .inline-edit')).toBeNull()
    expect(root.querySelector('.sheet > .inline-edit')).not.toBeNull()
  })
})
