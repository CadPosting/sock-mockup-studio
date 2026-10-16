// Inspector (design brief B1.3, app-flow "Nothing selected"): with no selection it shows the
// sheet-wide settings and a single hint line. Selection-specific panels come with task 10+.
//
// Built once and then synced, not rebuilt on every change: rebuilding would throw away the
// text cursor while someone is typing the client name.

import { VIEW_PRESETS, type ViewPresetId } from '../model/defaults'
import type { Mockup } from '../model/types'
import type { Store } from '../store/store'
import { h } from './dom'

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

export function createInspector(store: Store) {
  const client = h('input', { class: 'input', type: 'text', placeholder: 'e.g. Mount Allison University', maxlength: '200' })
  client.addEventListener('input', () => store.dispatch({ type: 'setHeader', patch: { client: client.value } }))
  // Typing a whole name is one undo step, not one per keystroke.
  client.addEventListener('focus', () => store.beginGesture())
  client.addEventListener('blur', () => store.endGesture())

  const template = select(TEMPLATES, (t) => store.dispatch({ type: 'setTemplate', template: t }))
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

  const root = h(
    'div',
    { class: 'inspector' },
    h('p', { class: 'hint' }, 'Click any part of the sock to colour it.'),
    h('h2', { class: 'inspector__title' }, 'Sheet'),
    field('Client', client),
    field('Sock template', template),
    field('Views', views),
    field('Page colour', page),
  )

  function sync(m: Mockup) {
    // Don't overwrite a field the user is typing in; undo/redo/open still update it otherwise.
    if (document.activeElement !== client && client.value !== m.header.client) client.value = m.header.client
    template.value = m.template
    views.value = currentViewSet(m)
    for (const [c, b] of pageButtons) b.setAttribute('aria-checked', String(m.pageColor === c))
  }

  return { root, sync }
}
