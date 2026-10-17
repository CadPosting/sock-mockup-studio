import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { createStore } from '../../src/store/store'

// A 1x1 PNG, enough for the schema's magic-byte check.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('repeat motif can be an image', () => {
  it('"Logo" switches the motif to the header logo; "Letter or word" switches back', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const store = createStore(STYLE_PRESETS.crew.make())
    mountEditor(root, store)
    store.dispatch({ type: 'setLogo', id: 'logo1', asset: { name: 'l.png', mime: 'image/png', dataUrl: PNG, width: 10, height: 10, palette: [] } })
    ;[...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Motif')!.click()
    const btn = (t: string) => [...root.querySelectorAll<HTMLButtonElement>('.panel--inspector .segmented__btn')].find((b) => b.textContent === t)!
    btn('Logo').click()
    expect(store.get().patterns.motif!.content).toEqual({ type: 'image', assetId: 'logo1' })
    expect(root.querySelector('.sheet [data-part="motif"] image')).not.toBeNull()
    btn('Letter or word').click()
    expect(store.get().patterns.motif!.content.type).toBe('text')
  })
})
