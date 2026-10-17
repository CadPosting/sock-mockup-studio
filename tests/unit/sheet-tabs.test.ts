import { describe, expect, it } from 'vitest'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { MAX_SHEETS, readWorkbook, serializeWorkbook, WORKBOOK_FORMAT } from '../../src/model/workbook'
import { createStore } from '../../src/store/store'

const setup = () => {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS.crew.make())
  const editor = mountEditor(root, store)
  const tabs = () => [...root.querySelectorAll<HTMLElement>('.sheet-tab')]
  const names = () => tabs().map((t) => t.querySelector('.sheet-tab__name')?.textContent ?? '')
  const btn = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!
  return { root, store, editor, tabs, names, btn }
}

describe('sheet tabs', () => {
  it('"+" copies the sheet as the next SAMPLE; clicking a tab switches; each keeps its own edits and undo', () => {
    const { root, store, tabs, names } = setup()
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#862633' } })
    root.querySelector<HTMLButtonElement>('.sheet-tabs__add')!.click()
    expect(names()).toEqual(['SAMPLE 1', 'SAMPLE 2'])
    store.dispatch({ type: 'setZoneColor', zone: 'heel', color: { hex: '#000000' } })
    tabs()[0].click()
    expect(store.get().zones.heel.hex).toBe('#862633')
    store.undo()
    expect(store.get().zones.heel.hex).not.toBe('#862633') // SAMPLE 1's own history
    tabs()[1].click()
    expect(store.get().zones.heel.hex).toBe('#000000')
    expect(root.querySelector('.sheet-tab--active')!.getAttribute('aria-selected')).toBe('true')
  })

  it('double-click renames: Enter keeps it, Esc cancels, an empty name keeps the old one', () => {
    const { editor, tabs, names } = setup()
    const rename = (value: string, key: string) => {
      tabs()[0].querySelector('.sheet-tab__name')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      const input = tabs()[0].querySelector<HTMLInputElement>('.sheet-tab__input')!
      input.value = value
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }
    rename('  Argyle   design ', 'Enter')
    expect(names()).toEqual(['Argyle design'])
    rename('Nope', 'Escape')
    expect(names()).toEqual(['Argyle design'])
    rename('   ', 'Enter')
    expect(names()).toEqual(['Argyle design'])
    expect(editor.workbook.data().sheets[0].name).toBe('Argyle design')
    expect(editor.isUnsaved()).toBe(true) // a rename is a change worth saving
  })

  it('a tab name with markup shows as plain text', () => {
    const { editor, root, names } = setup()
    editor.workbook.rename(editor.workbook.activeId(), '<img src=x onerror=alert(1)>')
    expect(root.querySelector('.sheet-tabs img')).toBeNull()
    expect(names()[0]).toBe('<img src=x onerror=alert(1)>')
  })

  it('delete asks first, then opens the neighbour; the last sheet cannot be deleted', () => {
    const { root, store, tabs, names, btn } = setup()
    btn('Duplicate to new sheet').click()
    expect(tabs()[0].querySelector('.sheet-tab__close')).toBeNull() // only the open tab has ×
    tabs()[1].querySelector<HTMLButtonElement>('.sheet-tab__close')!.click()
    expect(names()).toHaveLength(2) // not yet: it asks
    ;[...root.querySelectorAll<HTMLButtonElement>('.confirm-bar button')].find((b) => b.textContent === 'Delete')!.click()
    expect(names()).toEqual(['SAMPLE 1'])
    expect(store.get().header.tag).toEqual({ mode: 'sample', n: 1 })
    expect(root.querySelector('.sheet-tab__close')).toBeNull()
  })

  it('Save writes every tab into one file, and opening it brings all tabs back', async () => {
    const { editor, store, btn, names } = setup()
    btn('Duplicate to new sheet').click()
    const data = editor.workbook.data()
    const back = readWorkbook(JSON.parse(serializeWorkbook(data)))
    expect(back).toEqual(data)
    store.load(STYLE_PRESETS.crew.make())
    editor.workbook.load(back)
    expect(names()).toEqual(['SAMPLE 1', 'SAMPLE 2'])
    expect(store.get().header.tag).toEqual({ mode: 'sample', n: 2 }) // the tab that was open
  })
})

describe('workbook files', () => {
  const m = STYLE_PRESETS.crew.make()
  const good = { format: WORKBOOK_FORMAT, version: 1, active: 0, sheets: [{ name: 'A', mockup: m }] }

  it('an old single-mockup file opens as one sheet', () => {
    expect(readWorkbook(m)).toEqual({ sheets: [{ name: 'SAMPLE 1', mockup: m }], active: 0 })
  })

  it('tampered workbooks are refused whole', () => {
    const bad = [
      { ...good, active: 1 },
      { ...good, active: -1 },
      { ...good, active: 0.5 },
      { ...good, sheets: [] },
      { ...good, sheets: Array.from({ length: MAX_SHEETS + 1 }, () => good.sheets[0]) },
      { ...good, extra: 1 },
      { ...good, sheets: [{ name: 'A', mockup: m, x: 1 }] },
      { ...good, sheets: [{ name: 'A'.repeat(41), mockup: m }] },
      { ...good, sheets: [{ name: 5, mockup: m }] },
      { ...good, sheets: [{ name: 'A', mockup: { ...m, template: 'boot' } }] },
      { ...good, sheets: [good.sheets[0], { name: 'B', mockup: { version: 1 } }] },
      { ...good, version: 2 },
    ]
    for (const b of bad) expect(() => readWorkbook(JSON.parse(JSON.stringify(b)))).toThrow()
  })

  it('SVG logos in every sheet are cleaned on open', () => {
    const evil = btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="5" height="5"/></svg>')
    const m2 = structuredClone(m)
    m2.assets.e = { name: 'e.svg', mime: 'image/svg+xml', dataUrl: `data:image/svg+xml;base64,${evil}` }
    m2.header.logoAssetId = 'e'
    const wb = readWorkbook({ ...good, sheets: [good.sheets[0], { name: 'B', mockup: m2 }] })
    expect(atob(wb.sheets[1].mockup.assets.e.dataUrl.split(',')[1])).not.toContain('script')
  })
})

describe('main menu', () => {
  const item = (root: HTMLElement, label: string) => [...root.querySelectorAll<HTMLButtonElement>('.menu__item')].find((b) => b.textContent === label)!

  it('holds the file and sheet commands, and closes after each one', () => {
    const { root, names, btn } = setup()
    const list = () => root.querySelector<HTMLElement>('.menu--left')!
    btn('☰ Menu').click()
    expect(list().hidden).toBe(false)
    expect([...list().querySelectorAll('.menu__item')].map((b) => b.textContent)).toEqual([
      'New mockup…', 'Open file…', 'Save file', 'Add sheet', 'Duplicate to new sheet', 'Rename sheet', 'Delete sheet',
    ])
    expect(item(root, 'Delete sheet').disabled).toBe(true) // only one sheet
    item(root, 'Duplicate to new sheet').click()
    expect(list().hidden).toBe(true)
    expect(names()).toEqual(['SAMPLE 1', 'SAMPLE 2'])

    btn('☰ Menu').click()
    item(root, 'Rename sheet').click()
    const input = root.querySelector<HTMLInputElement>('.sheet-tab--active .sheet-tab__input')!
    expect(document.activeElement).toBe(input)
    input.value = 'Logo print'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(names()).toEqual(['SAMPLE 1', 'Logo print'])

    btn('☰ Menu').click()
    item(root, 'Delete sheet').click()
    ;[...root.querySelectorAll<HTMLButtonElement>('.confirm-bar button')].find((b) => b.textContent === 'Delete')!.click()
    expect(names()).toEqual(['SAMPLE 1'])

    btn('☰ Menu').click()
    item(root, 'New mockup…').click()
    expect(root.querySelector('.start')).not.toBeNull()
  })

  it('Esc or a click elsewhere closes it', () => {
    const { root, btn } = setup()
    const list = () => root.querySelector<HTMLElement>('.menu--left')!
    btn('☰ Menu').click()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(list().hidden).toBe(true)
    btn('☰ Menu').click()
    root.querySelector<HTMLElement>('.stage')!.click()
    expect(list().hidden).toBe(true)
  })
})

describe('Add sheet', () => {
  it('adds a fresh sheet in the same style, keeping the client and logo but not the design', () => {
    const root = document.createElement('div')
    document.body.replaceChildren(root)
    const m = STYLE_PRESETS['dress-crew'].make()
    m.header.client = 'Mount Royal University'
    m.header.tag = { mode: 'code', line1: 'HIP-CSC-06', line2: 'Midcalf Dress' }
    m.assets.logo1 = { name: 'l.png', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', width: 1, height: 1, palette: [] }
    m.header.logoAssetId = 'logo1'
    m.zones.leg = { hex: '#00aeef' }
    const store = createStore(m)
    mountEditor(root, store)
    ;[...root.querySelectorAll<HTMLButtonElement>('.menu__item')].find((b) => b.textContent === 'Add sheet')!.click()
    const fresh = store.get()
    expect([...root.querySelectorAll('.sheet-tab__name')].map((t) => t.textContent)).toEqual(['Sheet 1', 'Sheet 2'])
    expect(fresh.header.client).toBe('Mount Royal University')
    expect(fresh.header.logoAssetId).toBe('logo1')
    expect(fresh.header.tag).toEqual(m.header.tag)
    expect(fresh.template).toBe('crew')
    expect(fresh.zones.leg.hex).not.toBe('#00aeef')
  })
})

describe('file name in the top bar', () => {
  it('shows the automatic name until you type one; Save and the file use it; Esc puts it back', async () => {
    const { root, editor, btn } = setup()
    const input = root.querySelector<HTMLInputElement>('.file-name__input')!
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('mockup-crew-sample1')
    const type = (v: string) => {
      input.dispatchEvent(new FocusEvent('focus'))
      input.value = v
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    type('Mount Royal University socks')
    expect(editor.isUnsaved()).toBe(true)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const data = editor.workbook.data()
    expect(data.name).toBe('Mount Royal University socks')
    expect(readWorkbook(JSON.parse(serializeWorkbook(data))).name).toBe('Mount Royal University socks')
    // Save downloads under the typed name.
    const names: string[] = []
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      names.push(this.download)
    }
    URL.createObjectURL ??= () => 'blob:x'
    URL.revokeObjectURL ??= () => {}
    btn('Save file').click()
    HTMLAnchorElement.prototype.click = orig
    expect(names).toEqual(['mount-royal-university-socks.sockmockup.json'])
    type('Oops')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(editor.workbook.fileName()).toBe('Mount Royal University socks')
  })

  it('a tampered file name is refused; an old file without one opens fine', () => {
    const m = STYLE_PRESETS.crew.make()
    const good = { format: WORKBOOK_FORMAT, version: 1, active: 0, sheets: [{ name: 'A', mockup: m }] }
    expect(readWorkbook(good).name).toBeUndefined()
    expect(() => readWorkbook({ ...good, name: 5 })).toThrow()
    expect(() => readWorkbook({ ...good, name: 'x'.repeat(81) })).toThrow()
  })
})
