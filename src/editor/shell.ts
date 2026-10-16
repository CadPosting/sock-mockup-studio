// Editor shell (design brief B2): top bar, Layers (left), sheet (centre), Inspector (right).
// The sheet is re-rendered from state on every change; the editor never edits the SVG itself.

import { render } from '../render/sheet'
import type { Store } from '../store/store'
import { h } from './dom'
import { createInspector } from './inspector'
import { renderLayers } from './layers'

function button(label: string, opts: { title?: string; primary?: boolean; disabled?: boolean } = {}) {
  return h(
    'button',
    {
      type: 'button',
      class: opts.primary ? 'btn btn--primary' : 'btn',
      title: opts.title,
      disabled: opts.disabled,
    },
    label,
  )
}

const group = (...items: HTMLElement[]) => h('div', { class: 'topbar__group' }, ...items)

export function mountEditor(root: HTMLElement, store: Store) {
  const undo = button('↶ Undo', { title: 'Undo (Ctrl+Z)' })
  const redo = button('↷ Redo', { title: 'Redo (Ctrl+Shift+Z)' })
  undo.addEventListener('click', () => store.undo())
  redo.addEventListener('click', () => store.redo())

  const layersToggle = button('Layers', { title: 'Show or hide the Layers panel' })
  layersToggle.classList.add('topbar__layers-toggle')

  // Buttons for later tasks are shown but disabled, so the layout is final from now on.
  const later = (label: string, task: string) => button(label, { disabled: true, title: `Coming in ${task}` })

  const topbar = h(
    'header',
    { class: 'topbar' },
    group(layersToggle, later('New', 'task 14'), later('Open', 'task 17'), later('Save', 'task 17'), later('Dup → next', 'task 17')),
    group(undo, redo),
    group(later('+ Logo', 'task 11'), later('+ Text', 'task 12'), later('Dots', 'task 10'), later('Motif', 'task 10')),
    h('div', { class: 'topbar__spacer' }),
    group(button('Export ▾', { primary: true, disabled: true, title: 'Coming in task 15' })),
  )

  const banner = h('div', { class: 'banner', role: 'status', hidden: true }, 'Draft not autosaved — use Save.')
  const layers = h('aside', { class: 'panel panel--layers', 'aria-label': 'Layers' })
  const sheet = h('div', { class: 'sheet' })
  const stage = h('main', { class: 'stage' }, sheet)
  const inspector = createInspector(store)
  const right = h('aside', { class: 'panel panel--inspector', 'aria-label': 'Inspector' }, inspector.root)
  const small = h('div', { class: 'too-small' }, 'The editor needs a screen at least 1024 px wide. Exported mockups can be viewed on any device.')

  const app = h('div', { class: 'editor' }, topbar, banner, h('div', { class: 'workspace' }, layers, stage, right))
  root.replaceChildren(app, small)

  layersToggle.addEventListener('click', () => app.classList.toggle('editor--layers-open'))

  function update() {
    const m = store.get()
    sheet.replaceChildren(render(m))
    layers.replaceChildren(renderLayers(m))
    inspector.sync(m)
    undo.disabled = !store.canUndo()
    redo.disabled = !store.canRedo()
  }
  store.subscribe(update)
  update()

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
    // Leave undo inside text fields to the browser, so it undoes typing, not the sheet.
    const t = e.target as HTMLElement
    if (t.matches('input, textarea, select, [contenteditable]')) return
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
  })

  return {
    setAutosaveOk(ok: boolean) {
      banner.hidden = ok
    },
  }
}
