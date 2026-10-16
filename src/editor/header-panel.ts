// Header editor (PRD 5.8, design brief B4 "Spec rows"): tag, title, columns, spec rows,
// optional brand palette table.

import { newId } from '../model/defaults'
import type { Header, SpecRow } from '../model/types'
import type { Store } from '../store/store'
import { hexToCmyk } from '../util/color'
import { normalizeHex } from './color-field'
import { h } from './dom'

/** Every spec field seen across Peter's six sheets (discovery.md), offered as one-click rows. */
export const COMMON_FIELDS = [
  'Style code',
  'Style name',
  'Yarn composition',
  'Knitting standard',
  'Base yarn colour',
  'Cuff band colour',
  'Thread (logo) colour',
  'Logo',
  'Sizes',
  'Toe linking',
  'Footbed',
  'Cuff finishing',
  'Compression arch band',
  'Internal heel grips',
  'Sole grips',
] as const

/** A text input where a whole edit (focus to blur) is one undo step. */
function textInput(store: Store, value: string, onInput: (v: string) => void, attrs: Record<string, string> = {}) {
  const input = h('input', { class: 'input', type: 'text', value, maxlength: '500', ...attrs })
  input.addEventListener('focus', () => store.beginGesture())
  input.addEventListener('input', () => onInput(input.value))
  input.addEventListener('blur', () => store.endGesture())
  return input
}

const field = (label: string, ...controls: Node[]) =>
  h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), ...controls)

function segmented<T>(label: string, options: [T, string][], value: T, onPick: (v: T) => void) {
  const g = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label })
  for (const [v, text] of options) {
    const b = h('button', { type: 'button', class: 'segmented__btn', role: 'radio', 'aria-checked': String(v === value) }, text)
    b.addEventListener('click', () => onPick(v))
    g.append(b)
  }
  return field(label, g)
}

function tagControls(store: Store, header: Header): Node[] {
  const t = header.tag
  const setTag = (tag: Header['tag']) => store.dispatch({ type: 'setHeader', patch: { tag } })
  // Read the tag at the moment of the edit, not when the panel was built: moving from one line's
  // input straight to the other doesn't rebuild the panel, so a stale copy would undo line 1.
  const codeNow = () => store.get().header.tag as Extract<Header['tag'], { mode: 'code' }>
  const mode = segmented('Tag', [['sample', 'SAMPLE n'], ['code', 'Style code']], t.mode, (m) =>
    setTag(m === 'sample' ? { mode: 'sample', n: 1 } : { mode: 'code', line1: 'HIP-CSC-05', line2: 'Dress Crew' }),
  )
  if (t.mode === 'sample') {
    const n = h('input', { class: 'input input--num', type: 'number', min: '1', max: '999', step: '1', value: String(t.n), 'aria-label': 'Sample number' })
    n.addEventListener('change', () => {
      const v = Math.round(Number(n.value))
      if (v >= 1 && v <= 999) setTag({ mode: 'sample', n: v })
    })
    return [mode, field('Sample number', n)]
  }
  return [
    mode,
    field(
      'Style code (2 lines)',
      textInput(store, t.line1, (v) => setTag({ ...codeNow(), line1: v }), { 'aria-label': 'Style code line 1', maxlength: '200' }),
      textInput(store, t.line2, (v) => setTag({ ...codeNow(), line2: v }), { 'aria-label': 'Style code line 2', maxlength: '200' }),
    ),
  ]
}

function specRow(store: Store, row: SpecRow, index: number, count: number): HTMLElement {
  const update = (patch: Partial<Omit<SpecRow, 'id'>>) => store.dispatch({ type: 'updateSpec', id: row.id, patch })
  const handle = h('span', { class: 'spec__handle', draggable: 'true', title: 'Drag to reorder', 'aria-hidden': 'true' }, '⠿')
  const up = h('button', { type: 'button', class: 'btn btn--icon', title: 'Move up', 'aria-label': 'Move up', disabled: index === 0 }, '↑')
  const down = h('button', { type: 'button', class: 'btn btn--icon', title: 'Move down', 'aria-label': 'Move down', disabled: index === count - 1 }, '↓')
  up.addEventListener('click', () => store.dispatch({ type: 'moveSpec', id: row.id, to: index - 1 }))
  down.addEventListener('click', () => store.dispatch({ type: 'moveSpec', id: row.id, to: index + 1 }))
  const eye = h(
    'button',
    { type: 'button', class: 'btn btn--icon', 'aria-pressed': String(row.visible), title: row.visible ? 'Hide this line' : 'Show this line', 'aria-label': row.visible ? 'Hide' : 'Show' },
    row.visible ? '👁' : '—',
  )
  eye.addEventListener('click', () => update({ visible: !row.visible }))
  const del = h('button', { type: 'button', class: 'btn btn--icon btn--danger', title: 'Delete this line', 'aria-label': 'Delete' }, '×')
  del.addEventListener('click', () => store.dispatch({ type: 'removeSpec', id: row.id }))

  const li = h(
    'li',
    { class: row.visible ? 'spec' : 'spec spec--hidden', 'data-spec': row.id },
    handle,
    h(
      'div',
      { class: 'spec__inputs' },
      textInput(store, row.label, (v) => update({ label: v }), { placeholder: 'Label (optional)', 'aria-label': 'Spec label', maxlength: '200' }),
      textInput(store, row.value, (v) => update({ value: v }), { placeholder: 'Value', 'aria-label': 'Spec value' }),
    ),
    h('div', { class: 'spec__buttons' }, eye, up, down, del),
  )

  // Drag-and-drop reordering by the handle (B4). Rows are drop targets for each other.
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/x-spec', row.id)
    li.classList.add('spec--dragging')
  })
  handle.addEventListener('dragend', () => li.classList.remove('spec--dragging'))
  li.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('text/x-spec')) e.preventDefault()
  })
  li.addEventListener('drop', (e) => {
    const id = e.dataTransfer?.getData('text/x-spec')
    if (!id || id === row.id) return
    e.preventDefault()
    store.dispatch({ type: 'moveSpec', id, to: index })
  })
  return li
}

function paletteControls(store: Store, header: Header): Node[] {
  const pal = header.palette
  const setPal = (palette: Header['palette']) => store.dispatch({ type: 'setHeader', patch: { palette } })
  const palNow = () => store.get().header.palette // fresh at edit time (see codeNow above)
  const out: Node[] = [segmented('Brand palette table', [[true, 'Show'], [false, 'Hide']], pal.show, (show) => setPal({ ...pal, show }))]
  if (!pal.show) return out

  const list = h('ul', { class: 'pal' })
  pal.rows.forEach((row, i) => {
    const setRow = (patch: Partial<Header['palette']['rows'][number]>) =>
      setPal({ ...palNow(), rows: palNow().rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
    const sw = h('span', { class: 'pal__swatch' })
    sw.style.background = row.hex
    const hex = h('input', { class: 'input input--hex', type: 'text', value: row.hex, maxlength: '7', 'aria-label': 'Palette hex' })
    hex.addEventListener('change', () => {
      const v = normalizeHex(hex.value)
      hex.classList.toggle('input--invalid', !v)
      if (v) setRow({ hex: v })
    })
    const del = h('button', { type: 'button', class: 'btn btn--icon btn--danger', 'aria-label': 'Remove colour' }, '×')
    del.addEventListener('click', () => setPal({ ...pal, rows: pal.rows.filter((_, j) => j !== i) }))
    list.append(
      h(
        'li',
        { class: 'pal__row' },
        sw,
        h(
          'div',
          { class: 'spec__inputs' },
          textInput(store, row.name, (v) => setRow({ name: v }), { placeholder: 'Name (e.g. Garnet)', 'aria-label': 'Palette name', maxlength: '200' }),
          hex,
          textInput(store, row.cmyk, (v) => setRow({ cmyk: v }), { placeholder: `CMYK from brand guide (blank = approx. ${hexToCmyk(row.hex).join('/')})`, 'aria-label': 'Palette CMYK', maxlength: '200' }),
        ),
        del,
      ),
    )
  })
  const add = h('button', { type: 'button', class: 'btn btn--outline', disabled: pal.rows.length >= 8 }, '+ Add colour')
  add.addEventListener('click', () => setPal({ ...pal, rows: [...pal.rows, { name: '', hex: '#808080', cmyk: '' }] }))
  // One click to start the table from the logo's extracted colours.
  const logo = header.logoAssetId ? store.get().assets[header.logoAssetId] : undefined
  const fromLogo = h('button', { type: 'button', class: 'btn btn--outline', disabled: !logo?.palette?.length }, 'Fill from logo colours')
  fromLogo.addEventListener('click', () =>
    setPal({ ...pal, rows: (logo?.palette ?? []).slice(0, 8).map((hexValue) => ({ name: '', hex: hexValue, cmyk: '' })) }),
  )
  out.push(list, h('div', { class: 'row-buttons' }, add, fromLogo))
  return out
}

export function headerPanel(store: Store): HTMLElement {
  const header = store.get().header
  const set = (patch: Partial<Omit<Header, 'specs'>>) => store.dispatch({ type: 'setHeader', patch })

  const rows = h('ol', { class: 'specs' }, ...header.specs.map((r, i) => specRow(store, r, i, header.specs.length)))

  const add = h('button', { type: 'button', class: 'btn btn--outline' }, '+ Add row')
  add.addEventListener('click', () => store.dispatch({ type: 'addSpec', row: { id: newId('spec'), label: '', value: '', visible: true } }))
  const common = h(
    'select',
    { class: 'input', 'aria-label': 'Add common field' },
    h('option', { value: '' }, 'Add common field…'),
    ...COMMON_FIELDS.map((f) => h('option', { value: f }, f)),
  )
  common.addEventListener('change', () => {
    if (!common.value) return
    store.dispatch({ type: 'addSpec', row: { id: newId('spec'), label: common.value, value: '', visible: true } })
  })

  return h(
    'div',
    { class: 'panel-section' },
    h('h2', { class: 'inspector__title' }, 'Header & specs'),
    ...tagControls(store, header),
    field('Title', textInput(store, header.title, (v) => set({ title: v }), { 'aria-label': 'Title', maxlength: '200' })),
    segmented('Title style', [[true, 'Bold'], [false, 'Regular']], header.titleBold, (titleBold) => set({ titleBold })),
    segmented('Spec columns', [[1, '1 column'], [2, '2 columns (bulleted)']] as [1 | 2, string][], header.columns, (columns) => set({ columns })),
    field('Spec lines', rows, h('div', { class: 'row-buttons' }, add, common)),
    ...paletteControls(store, header),
  )
}
