import { describe, expect, it } from 'vitest'
import { COMMON_FIELDS } from '../../src/editor/header-panel'
import { mountEditor } from '../../src/editor/shell'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { migrate } from '../../src/model/schema'
import { render } from '../../src/render/sheet'
import { createStore } from '../../src/store/store'

function setup(preset: keyof typeof STYLE_PRESETS = 'crew') {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const store = createStore(STYLE_PRESETS[preset].make())
  mountEditor(root, store)
  const panel = () => root.querySelector<HTMLElement>('.inspector > div:not([hidden])')!
  const type = (input: HTMLInputElement, value: string) => {
    input.focus()
    input.value = value
    input.dispatchEvent(new Event('input'))
    input.blur()
  }
  const openHeader = () => root.querySelector('.sheet [data-field="title"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return { root, store, panel, type, openHeader }
}

describe('header editor (task 13)', () => {
  it('clicking the title on the sheet opens the header editor', () => {
    const { panel, openHeader } = setup()
    openHeader()
    expect(panel().querySelector('.inspector__title')!.textContent).toBe('Header & specs')
  })

  it('every spec field from discovery.md can be added and filled in, and prints on the sheet', () => {
    const { store, panel, type, openHeader } = setup()
    openHeader()
    const values: Record<string, string> = {
      'Style code': 'HIP1-CSC-02',
      'Style name': 'Athletic Ankle',
      'Yarn composition': '80% cotton, 18% polyamide, 2% elastane',
      'Knitting standard': '156N',
      'Base yarn colour': 'MRS001 (cream)',
      'Cuff band colour': '#A8BDB8',
      'Thread (logo) colour': 'black',
      Logo: 'embroidered patch on cuff',
      Sizes: 'S/M/L (M for sample)',
      'Toe linking': 'seamless',
      Footbed: 'half terry cushioning',
      'Cuff finishing': 'ribbed',
      'Compression arch band': 'yes',
      'Internal heel grips': 'PVC',
      'Sole grips': 'silicone, #3D3935',
    }
    expect(Object.keys(values)).toEqual([...COMMON_FIELDS])
    for (const f of COMMON_FIELDS) {
      const select = panel().querySelector<HTMLSelectElement>('select[aria-label="Add common field"]')!
      select.value = f
      select.dispatchEvent(new Event('change'))
      const inputs = panel().querySelectorAll<HTMLInputElement>('input[aria-label="Spec value"]')
      type(inputs[inputs.length - 1], values[f])
    }
    const specs = store.get().header.specs.slice(-15)
    expect(specs.map((s) => [s.label, s.value])).toEqual(Object.entries(values))
    store.dispatch({ type: 'setHeader', patch: { columns: 2 } })
    const sheet = render(store.get()).querySelector('[data-part="specs"]')!.textContent!
    for (const [label, value] of Object.entries(values)) {
      expect(sheet).toContain(label)
      expect(sheet).toContain(value.split(' ')[0])
    }
    expect(() => migrate(JSON.parse(JSON.stringify(store.get())))).not.toThrow()
  })

  it('typing a spec value is one undo step; hide, reorder and delete work', () => {
    const { store, panel, type, openHeader } = setup()
    openHeader()
    const [first, second] = store.get().header.specs
    type(panel().querySelector<HTMLInputElement>('input[aria-label="Spec value"]')!, 'Crew - Half terry')
    expect(store.get().header.specs[0].value).toBe('Crew - Half terry')
    store.undo()
    expect(store.get().header.specs[0].value).toBe(first.value)

    panel().querySelector<HTMLButtonElement>('.spec button[aria-label="Hide"]')!.click()
    expect(store.get().header.specs[0].visible).toBe(false)
    expect(render(store.get()).querySelector(`[data-field="spec:${first.id}"]`)).toBeNull()

    panel().querySelectorAll<HTMLButtonElement>('.spec button[aria-label="Move down"]')[0].click()
    expect(store.get().header.specs.map((s) => s.id).slice(0, 2)).toEqual([second.id, first.id])

    const n = store.get().header.specs.length
    panel().querySelector<HTMLButtonElement>('.spec button[aria-label="Delete"]')!.click()
    expect(store.get().header.specs).toHaveLength(n - 1)
  })

  it('tag: SAMPLE number, or a two-line style code', () => {
    const { store, panel, type, openHeader } = setup()
    openHeader()
    const n = panel().querySelector<HTMLInputElement>('input[aria-label="Sample number"]')!
    n.value = '3'
    n.dispatchEvent(new Event('change'))
    expect(store.get().header.tag).toEqual({ mode: 'sample', n: 3 })
    ;[...panel().querySelectorAll<HTMLButtonElement>('.segmented__btn')].find((b) => b.textContent === 'Style code')!.click()
    type(panel().querySelector<HTMLInputElement>('input[aria-label="Style code line 2"]')!, 'Dress Crew Argyle')
    expect(store.get().header.tag).toEqual({ mode: 'code', line1: 'HIP-CSC-05', line2: 'Dress Crew Argyle' })
  })

  it('title, bold and columns', () => {
    const { store, panel, type, openHeader } = setup()
    openHeader()
    type(panel().querySelector<HTMLInputElement>('input[aria-label="Title"]')!, 'Mockup - Dress Crew - Key Specifications')
    ;[...panel().querySelectorAll<HTMLButtonElement>('.segmented__btn')].find((b) => b.textContent === 'Regular')!.click()
    ;[...panel().querySelectorAll<HTMLButtonElement>('.segmented__btn')].find((b) => b.textContent!.startsWith('2 columns'))!.click()
    expect(store.get().header).toMatchObject({ title: 'Mockup - Dress Crew - Key Specifications', titleBold: false, columns: 2 })
  })

  it('palette table: show, fill from logo colours, edit hex, typed CMYK', () => {
    const { store, panel, type, openHeader } = setup()
    store.dispatch({
      type: 'setLogo',
      id: 'l',
      asset: { name: 'mta.png', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 100, height: 100, palette: ['#862633', '#ffb81c'] },
    })
    openHeader()
    ;[...panel().querySelectorAll<HTMLButtonElement>('.segmented__btn')].find((b) => b.textContent === 'Show')!.click()
    ;[...panel().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Fill from logo colours')!.click()
    expect(store.get().header.palette.rows.map((r) => r.hex)).toEqual(['#862633', '#ffb81c'])
    type(panel().querySelectorAll<HTMLInputElement>('input[aria-label="Palette name"]')[0], 'Garnet')
    type(panel().querySelectorAll<HTMLInputElement>('input[aria-label="Palette CMYK"]')[0], '0C 100M 65Y 34K')
    expect(store.get().header.palette.rows[0]).toEqual({ name: 'Garnet', hex: '#862633', cmyk: '0C 100M 65Y 34K' })
  })

  it('regression: editing two inputs in a row keeps both edits (no stale panel state)', () => {
    const { root, store, panel, type, openHeader } = setup()
    openHeader()
    ;[...panel().querySelectorAll<HTMLButtonElement>('.segmented__btn')].find((b) => b.textContent === 'Style code')!.click()
    type(panel().querySelector<HTMLInputElement>('input[aria-label="Style code line 1"]')!, 'MTA-DC-01')
    type(panel().querySelector<HTMLInputElement>('input[aria-label="Style code line 2"]')!, 'Dress Crew')
    expect(store.get().header.tag).toEqual({ mode: 'code', line1: 'MTA-DC-01', line2: 'Dress Crew' })
    // Colour: hex then factory ref in a row.
    root.querySelector('.sheet [data-view="1"] [data-zone="heel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const hex = panel().querySelector<HTMLInputElement>('.input--hex')!
    hex.value = '#862633'
    hex.dispatchEvent(new Event('change'))
    const ref = panel().querySelector<HTMLInputElement>('input[aria-label="Colour factory reference"]')!
    ref.focus() // focus stays in the panel, so it doesn't rebuild between the two edits
    ref.value = 'Pantone 202C'
    ref.dispatchEvent(new Event('change'))
    expect(store.get().zones.heel).toEqual({ hex: '#862633', ref: 'Pantone 202C' })
  })

  it('regression: a focused button (real browsers focus on click) does not stop the panel refreshing', () => {
    const { store, panel, openHeader } = setup()
    openHeader()
    const add = [...panel().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '+ Add row')!
    add.focus()
    add.click()
    expect(panel().querySelectorAll('.spec')).toHaveLength(store.get().header.specs.length)
  })
})
