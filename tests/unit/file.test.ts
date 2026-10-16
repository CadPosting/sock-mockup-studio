import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { nextSample, serializeMockup } from '../../src/io/file'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { migrate } from '../../src/model/schema'
import { render } from '../../src/render/sheet'
import { createStore } from '../../src/store/store'

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// jsdom has no object URLs or real downloads: record what would have been downloaded.
let downloads: { name: string; blob: Blob }[] = []
beforeEach(() => {
  downloads = []
  const blobs = new Map<string, Blob>()
  URL.createObjectURL = vi.fn((b: Blob) => {
    const u = `blob:test/${blobs.size}`
    blobs.set(u, b)
    return u
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: blobs.get(this.href)! })
  })
})
afterEach(() => vi.restoreAllMocks())

function richMockup() {
  const m = STYLE_PRESETS['crew-grip'].make()
  m.header.client = 'Mount Allison'
  m.assets.logo = { name: 'mta.png', mime: 'image/png', dataUrl: PNG_1PX, width: 300, height: 80, palette: ['#862633'] }
  m.header.logoAssetId = 'logo'
  m.zones.cuff = { hex: '#862633', ref: 'Pantone 202C' }
  m.zoneFills = [{ zone: 'leg', pattern: { type: 'argyle', color: { hex: '#862633' }, line: { hex: '#ffb81c' }, size: 40 } }]
  m.placements = [{ id: 'p1', view: 2, content: { type: 'image', assetId: 'logo' }, x: 190, y: 100, scale: 0.8, rotation: 0, clip: true }]
  return m
}

function setup(m = STYLE_PRESETS.crew.make()) {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(m)
  const editor = mountEditor(root, store)
  const btn = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!
  return { root, store, editor, btn }
}

describe('save -> reopen (task 17)', () => {
  it('a saved file reopens to an identical render', async () => {
    const m = richMockup()
    const reopened = migrate(JSON.parse(serializeMockup(m)))
    expect(reopened).toEqual(m)
    expect(render(reopened).outerHTML).toBe(render(m).outerHTML)
  })

  it('Save downloads client-template-sampleN.sockmockup.json with the whole mockup in it', async () => {
    const { store, btn } = setup(richMockup())
    btn('Save').click()
    expect(downloads.map((d) => d.name)).toEqual(['mount-allison-crew-sample1.sockmockup.json'])
    const back = migrate(JSON.parse(await downloads[0].blob.text()))
    expect(back).toEqual(store.get())
  })
})

describe('next sample', () => {
  it('bumps SAMPLE n and copies everything else; the original is untouched', () => {
    const m = richMockup()
    const n = nextSample(m)
    expect(n.header.tag).toEqual({ mode: 'sample', n: 2 })
    expect({ ...n, header: { ...n.header, tag: m.header.tag } }).toEqual(m)
    expect(m.header.tag).toEqual({ mode: 'sample', n: 1 })
    const code = STYLE_PRESETS['dress-crew'].make()
    expect(nextSample(code).header.tag).toEqual(code.header.tag)
  })

  it('"Dup → next" saves SAMPLE 1 to a file, then the editor is on SAMPLE 2 (unsaved)', async () => {
    const { store, editor, btn } = setup(richMockup())
    btn('Dup → next').click()
    expect(downloads).toHaveLength(1)
    expect(JSON.parse(await downloads[0].blob.text()).header.tag).toEqual({ mode: 'sample', n: 1 })
    expect(store.get().header.tag).toEqual({ mode: 'sample', n: 2 })
    expect(editor.isUnsaved()).toBe(true)
  })
})

describe('unsaved changes', () => {
  it('a fresh style is not "unsaved"; an edit is; Save clears it; undo back to the saved state is clean', () => {
    const { store, editor, btn } = setup()
    expect(editor.isUnsaved()).toBe(false)
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#862633' } })
    expect(editor.isUnsaved()).toBe(true)
    btn('Save').click()
    expect(editor.isUnsaved()).toBe(false)
    store.dispatch({ type: 'setStripes', stripes: 2 })
    expect(editor.isUnsaved()).toBe(true)
    store.undo()
    expect(editor.isUnsaved()).toBe(false)
  })

  it('closing the tab with unsaved changes triggers the browser leave prompt', () => {
    const { store } = setup()
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(leave()).toBe(false)
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#862633' } })
    expect(leave()).toBe(true)
  })

  it('Ctrl+S saves', () => {
    setup(richMockup())
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    expect(downloads).toHaveLength(1)
  })
})

describe('open', () => {
  const file = (m: unknown, name = 'next.sockmockup.json') => new File([JSON.stringify(m)], name, { type: 'application/json' })
  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('over unsaved work it asks first; Cancel keeps the work, "Open it" replaces and counts as saved', async () => {
    const { root, store, editor } = setup()
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#862633' } })
    const mine = store.get()
    await editor.openFile(file(richMockup()))
    await flush()
    const bar = root.querySelector<HTMLElement>('.confirm-bar')!
    expect(bar.hidden).toBe(false)
    ;[...bar.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click()
    expect(store.get()).toBe(mine)
    await editor.openFile(file(richMockup()))
    await flush()
    ;[...bar.querySelectorAll('button')].find((b) => b.textContent === 'Open it')!.click()
    expect(store.get().header.client).toBe('Mount Allison')
    expect(editor.isUnsaved()).toBe(false)
  })

  it('a damaged file is refused with the app-flow message, the mockup untouched', async () => {
    const { root, store, editor } = setup()
    const before = store.get()
    await editor.openFile(new File(['{"version":1,"oops":true}'], 'bad.sockmockup.json'))
    await flush()
    expect(store.get()).toBe(before)
    expect(root.querySelector('.toast--error')!.textContent).toBe("This file isn't a Sock Mockup Studio file (or it's damaged).")
  })

  it('dropping a .sockmockup.json on the window opens it', async () => {
    const { store } = setup()
    const drop = new Event('drop', { cancelable: true, bubbles: true }) as DragEvent
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file(richMockup())], types: ['Files'] } })
    window.dispatchEvent(drop)
    await new Promise((r) => setTimeout(r, 20))
    expect(store.get().header.client).toBe('Mount Allison')
  })
})

describe('Codex review of task 17', () => {
  it('Dup -> next can be undone back to SAMPLE 1 (in case the save download was blocked)', () => {
    const { store, btn } = setup(richMockup())
    const sample1 = store.get()
    btn('Dup → next').click()
    expect(store.get().header.tag).toEqual({ mode: 'sample', n: 2 })
    store.undo()
    expect(store.get()).toBe(sample1)
  })

  it('after a save, undoing back to the untouched style still counts as unsaved', () => {
    const { store, editor, btn } = setup()
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#862633' } })
    btn('Save').click()
    store.undo() // back to the plain preset, which no longer matches the saved file
    expect(editor.isUnsaved()).toBe(true)
  })

  it('Ctrl+S saves while the click-to-edit box is open', () => {
    const { root } = setup(richMockup())
    root.querySelector('.sheet [data-field="title"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.inline-edit')!.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    expect(downloads).toHaveLength(1)
  })

  it('opening a file first finishes an open text edit, so later typing cannot change the new file', async () => {
    const { root, store, editor } = setup()
    root.querySelector('.sheet [data-field="title"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const box = root.querySelector<HTMLInputElement>('.inline-edit')!
    await editor.openFile(new File([JSON.stringify(richMockup())], 'x.sockmockup.json'))
    await new Promise((r) => setTimeout(r, 0))
    expect(root.querySelector('.inline-edit')).toBeNull()
    box.value = 'typed after open'
    box.dispatchEvent(new Event('input'))
    expect(store.get().header.title).toBe('Mockup - Crew Grip Socks - Key Specifications')
  })

  it('a mockup file dropped on the logo box opens it instead of being refused as a logo', async () => {
    const { root, store } = setup()
    const drop = new Event('drop', { cancelable: true, bubbles: true }) as DragEvent
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [new File([JSON.stringify(richMockup())], 'm.sockmockup.json', { type: 'application/json' })], types: ['Files'] } })
    root.querySelector('.logo-drop')!.dispatchEvent(drop)
    await new Promise((r) => setTimeout(r, 20))
    expect(store.get().header.client).toBe('Mount Allison')
  })

  it('remounting removes the old start dialog key capture', () => {
    const first = setup()
    first.editor.openMenu({ canClose: false })
    const second = setup()
    second.store.dispatch({ type: 'setStripes', stripes: 2 })
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    expect(second.store.get().stripes).toBe(0)
  })
})
