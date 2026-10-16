// Inspector (design brief B1.3, app-flow "Nothing selected"): with no selection it shows the
// sheet-wide settings and a single hint line; otherwise the panel for what's selected.
//
// Built once and then synced, not rebuilt on every change: rebuilding would throw away the
// text cursor while someone is typing the client name.

import { STYLE_PRESETS, type StylePresetId, VIEW_PRESETS, type ViewPresetId } from '../model/defaults'
import type { Mockup } from '../model/types'
import type { Store } from '../store/store'
import { h } from './dom'
import { headerPanel } from './header-panel'
import { gripPanel, motifPanel, placementPanel, zonePanel } from './panels'
import type { SelectionStore } from './selection'

const TEMPLATES: [Mockup['template'], string][] = [
  ['crew', 'Crew'],
  ['ankle', 'Ankle'],
  ['ankle-tab', 'Ankle tab'],
]
const VIEW_SETS: [ViewPresetId, string][] = [
  ['front-back', 'Front · Back · Left · Right'],
  ['front-sole', 'Front · Sole · Left · Right'],
]

function field(label: string, control: HTMLElement) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control)
}

function select<T extends string>(options: [T, string][], onChange: (v: T) => void) {
  const s = h('select', { class: 'input' }, ...options.map(([v, text]) => h('option', { value: v }, text)))
  s.addEventListener('change', () => onChange(s.value as T))
  return s
}

/** Which view preset the current views match, by kind (labels may have been edited). */
function currentViewSet(m: Mockup): ViewPresetId | '' {
  const kinds = m.views.map((v) => v.kind).join()
  const hit = VIEW_SETS.find(([id]) => VIEW_PRESETS[id].map((v) => v.kind).join() === kinds)
  return hit ? hit[0] : ''
}

export function createInspector(
  store: Store,
  selection: SelectionStore,
  pickLogo: () => void,
  onStyleApplied: (name: string) => void = () => {},
) {
  const logoName = h('span', { class: 'logo-field__name' })
  const upload = h('button', { type: 'button', class: 'btn btn--outline' }, 'Upload logo')
  upload.addEventListener('click', pickLogo)
  const removeLogo = h('button', { type: 'button', class: 'btn btn--danger' }, 'Remove')
  removeLogo.addEventListener('click', () => store.dispatch({ type: 'removeLogo' }))
  const logoField = h('div', { class: 'logo-field' }, upload, logoName, removeLogo)

  const client = h('input', { class: 'input', type: 'text', placeholder: 'e.g. Mount Allison University', maxlength: '200' })
  client.addEventListener('input', () => store.dispatch({ type: 'setHeader', patch: { client: client.value } }))
  // Typing a whole name is one undo step, not one per keystroke.
  client.addEventListener('focus', () => store.beginGesture())
  client.addEventListener('blur', () => store.endGesture())

  const template = select(TEMPLATES, (t) => store.dispatch({ type: 'setTemplate', template: t }))
  // Sock style = a starting point (template, views, grip dots, spec defaults). Picking one is a
  // one-off action, so the menu snaps back to its prompt afterwards.
  const style = select<StylePresetId | ''>(
    [['', 'Change sock style…'], ...Object.entries(STYLE_PRESETS).map(([id, p]) => [id, p.name] as [StylePresetId, string])],
    (id) => {
      if (!id) return
      store.dispatch({ type: 'applyStyle', style: STYLE_PRESETS[id].make() })
      style.value = ''
      onStyleApplied(STYLE_PRESETS[id].name)
    },
  )
  const views = select(VIEW_SETS, (id) =>
    // Keep any labels the user typed for views of the same kind (e.g. "Left - outer").
    store.dispatch({
      type: 'setViews',
      views: VIEW_PRESETS[id].map((v, i) =>
        store.get().views[i].kind === v.kind ? { ...store.get().views[i] } : { ...v },
      ) as Mockup['views'],
    }),
  )

  const page = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Page colour' })
  const pageButtons = (['white', 'grey'] as const).map((c) => {
    const b = h('button', { type: 'button', class: 'segmented__btn', role: 'radio' }, c === 'white' ? 'White' : 'Light grey')
    b.addEventListener('click', () => store.dispatch({ type: 'setPageColor', pageColor: c }))
    page.append(b)
    return [c, b] as const
  })

  const segButtons = <T,>(label: string, options: [T, string][], onPick: (v: T) => void) => {
    const g = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label })
    const buttons = options.map(([v, text]) => {
      const b = h('button', { type: 'button', class: 'segmented__btn', role: 'radio' }, text)
      b.addEventListener('click', () => onPick(v))
      g.append(b)
      return [v, b] as const
    })
    return { g, buttons }
  }
  const stripes = segButtons<0 | 1 | 2>('Cuff stripes', [[0, 'None'], [1, '1'], [2, '2']], (n) => store.dispatch({ type: 'setStripes', stripes: n }))
  const band = segButtons<boolean>('Mid band', [[false, 'Off'], [true, 'On']], (on) => store.dispatch({ type: 'setMidBand', on }))

  const editHeader = h('button', { type: 'button', class: 'btn btn--outline' }, 'Edit title, tag & specs')
  editHeader.addEventListener('click', () => selection.set({ kind: 'header' }))

  const sheet = h(
    'div',
    { class: 'panel-section' },
    h('p', { class: 'hint' }, 'Click any part of the sock to colour it.'),
    h('h2', { class: 'inspector__title' }, 'Sheet'),
    field('Sock style', style),
    field('Client', client),
    field('Logo', logoField),
    field('Header', editHeader),
    field('Sock template', template),
    field('Views', views),
    field('Cuff stripes', stripes.g),
    field('Mid band', band.g),
    field('Page colour', page),
  )
  const selected = h('div')
  const root = h('div', { class: 'inspector' }, sheet, selected)

  function syncSheet(m: Mockup) {
    // Don't overwrite a field the user is typing in; undo/redo/open still update it otherwise.
    if (document.activeElement !== client && client.value !== m.header.client) client.value = m.header.client
    template.value = m.template
    const logo = m.header.logoAssetId ? m.assets[m.header.logoAssetId] : undefined
    logoName.textContent = logo ? logo.name : 'PNG, JPG or SVG'
    upload.textContent = logo ? 'Replace' : 'Upload logo'
    removeLogo.hidden = !logo
    views.value = currentViewSet(m)
    for (const [c, b] of pageButtons) b.setAttribute('aria-checked', String(m.pageColor === c))
    for (const [n, b] of stripes.buttons) b.setAttribute('aria-checked', String(m.stripes === n))
    for (const [on, b] of band.buttons) b.setAttribute('aria-checked', String(m.midBand === on))
  }

  // Pressing a panel button while typing blurs the text box, which ends the edit and changes the
  // state. Rebuilding the panel right then would replace the button under the pointer and the
  // click would be lost (found in Chrome: the first click on a font after typing did nothing).
  // So while a pointer is down inside the panel, hold rebuilds until just after the click.
  let pressing = false
  let pending = false
  root.addEventListener('pointerdown', () => (pressing = true), true)
  const release = () => {
    if (!pressing) return
    pressing = false
    // The click event fires right after pointerup; rebuild once it has been handled.
    setTimeout(() => {
      if (pending) {
        pending = false
        sync(store.get())
      }
    })
  }
  window.addEventListener('pointerup', release)
  // A cancelled press (touch scroll) or leaving the window never sends pointerup: don't stay paused.
  window.addEventListener('pointercancel', release)
  window.addEventListener('blur', release)

  function sync(m: Mockup) {
    if (pressing) {
      pending = true
      return
    }
    const sel = selection.get()
    sheet.hidden = sel !== null
    selected.hidden = sel === null
    if (!sel) return syncSheet(m)
    // Rebuild the selection panel from state, except while the user is mid-edit in a text,
    // number, slider or colour input (rebuilding would drop their cursor or the drag). Buttons and
    // menus keep focus after a click too, but those must rebuild, or "+ Add row" shows nothing.
    const active = document.activeElement
    const midEdit = active instanceof HTMLElement && selected.contains(active) && active.matches('input:not([type="checkbox"]), textarea')
    if (midEdit && selected.dataset.for === JSON.stringify(sel)) return
    selected.dataset.for = JSON.stringify(sel)
    selected.replaceChildren(
      sel.kind === 'zone'
        ? zonePanel(store, sel.zone)
        : sel.kind === 'placement'
          ? placementPanel(store, selection, sel.id)
          : sel.kind === 'header'
            ? headerPanel(store)
          : sel.kind === 'gripDots'
            ? gripPanel(store, selection)
            : motifPanel(store, selection),
    )
  }

  return { root, sync }
}
