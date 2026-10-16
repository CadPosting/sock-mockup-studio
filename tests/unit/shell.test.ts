import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { createStore } from '../../src/store/store'

const setup = () => {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS.crew.make())
  const editor = mountEditor(root, store)
  const btn = (label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent!.includes(label))!
  return { root, store, editor, btn }
}

describe('editor shell', () => {
  it('re-renders the sheet when the state changes; undo/redo buttons follow history', () => {
    const { root, store, btn } = setup()
    expect(btn('Undo').disabled).toBe(true)
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#7a1f2b' } })
    expect(root.querySelector('.sheet [data-zone="heel"]')!.getAttribute('fill')).toBe('#7a1f2b')
    expect(btn('Undo').disabled).toBe(false)
    btn('Undo').click()
    expect(root.querySelector('.sheet [data-zone="heel"]')!.getAttribute('fill')).toBe('#ffffff')
    expect(btn('Redo').disabled).toBe(false)
  })

  it('typing a client name is one undo step', () => {
    const { root, store } = setup()
    const input = root.querySelector<HTMLInputElement>('.panel--inspector input')!
    input.focus()
    for (const v of ['M', 'Mo', 'Mou', 'Mount']) {
      input.value = v
      input.dispatchEvent(new Event('input'))
    }
    input.blur()
    expect(store.get().header.client).toBe('Mount')
    store.undo()
    expect(store.get().header.client).toBe('')
  })

  it('Ctrl+Z undoes on the sheet but is left to the browser inside a text field', () => {
    const { root, store } = setup()
    store.dispatch({ type: 'setStripes', stripes: 2 })
    const key = () => new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
    root.querySelector('.panel--inspector input')!.dispatchEvent(key())
    expect(store.get().stripes).toBe(2)
    document.body.dispatchEvent(key())
    expect(store.get().stripes).toBe(0)
  })

  it('autosave failure banner shows and hides; user text is never markup', () => {
    const { root, store, editor } = setup()
    const banner = root.querySelector<HTMLElement>('.banner')!
    editor.setAutosaveOk(false)
    expect(banner.hidden).toBe(false)
    editor.setAutosaveOk(true)
    expect(banner.hidden).toBe(true)
    store.dispatch({ type: 'setViewLabel', index: 0, label: '<img src=x onerror=alert(1)>' })
    expect(root.querySelector('img')).toBeNull()
  })
})
