// Editor shell (design brief B2): top bar, Layers (left), sheet (centre), Inspector (right).
// The sheet is re-rendered from state on every change; the editor never edits the SVG itself.
// Hover/selection highlights are CSS classes on the rendered nodes, styled by the page's CSS,
// so they can never end up in an export (B1.4).

import { newId } from '../model/defaults'
import type { ZoneId } from '../model/types'
import { checkLogoFile } from '../io/upload'
import { readImage } from '../util/palette'
import { render } from '../render/sheet'
import type { Store } from '../store/store'
import { h } from './dom'
import { createInspector } from './inspector'
import { renderLayers } from './layers'
import { DEFAULT_GRIP, DEFAULT_MOTIF } from './panels'
import { createSelection, type Selection } from './selection'
import { createToasts } from './toast'

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

/** Selection as the string used by Layers rows' data-select. */
const selectKey = (s: Selection) => (s === null ? null : s.kind === 'zone' ? `zone:${s.zone}` : s.kind)

function parseSelectKey(key: string): Selection {
  if (key.startsWith('zone:')) return { kind: 'zone', zone: key.slice(5) as ZoneId }
  if (key === 'gripDots' || key === 'motif') return { kind: key }
  return null
}

export function mountEditor(root: HTMLElement, store: Store) {
  const selection = createSelection()

  const undo = button('↶ Undo', { title: 'Undo (Ctrl+Z)' })
  const redo = button('↷ Redo', { title: 'Redo (Ctrl+Shift+Z)' })
  undo.addEventListener('click', () => store.undo())
  redo.addEventListener('click', () => store.redo())

  const layersToggle = button('Layers', { title: 'Show or hide the Layers panel' })
  layersToggle.classList.add('topbar__layers-toggle')

  // Dots / Motif add the pattern if it isn't there yet, then select it so its settings show.
  const dots = button('Dots', { title: 'Grip dots on the sole' })
  dots.addEventListener('click', () => {
    if (!store.get().patterns.gripDots) store.dispatch({ type: 'setGripDots', gripDots: structuredClone(DEFAULT_GRIP) })
    selection.set({ kind: 'gripDots' })
  })
  const motifBtn = button('Motif', { title: 'Repeat a letter or word across the sock' })
  motifBtn.addEventListener('click', () => {
    if (!store.get().patterns.motif) store.dispatch({ type: 'setMotif', motif: structuredClone(DEFAULT_MOTIF) })
    selection.set({ kind: 'motif' })
  })

  // Buttons for later tasks are shown but disabled, so the layout is final from now on.
  const later = (label: string, task: string) => button(label, { disabled: true, title: `Coming in ${task}` })

  const topbar = h(
    'header',
    { class: 'topbar' },
    group(layersToggle, later('New', 'task 14'), later('Open', 'task 17'), later('Save', 'task 17'), later('Dup → next', 'task 17')),
    group(undo, redo),
    group(later('+ Logo', 'task 11'), later('+ Text', 'task 12'), dots, motifBtn),
    h('div', { class: 'topbar__spacer' }),
    group(button('Export ▾', { primary: true, disabled: true, title: 'Coming in task 15' })),
  )

  const banner = h('div', { class: 'banner', role: 'status', hidden: true }, 'Draft not autosaved — use Save.')
  const layers = h('aside', { class: 'panel panel--layers', 'aria-label': 'Layers' })
  const sheet = h('div', { class: 'sheet' })
  const svgHolder = h('div', { class: 'sheet__svg' })
  // Editor-only drop box over the header logo spot (app-flow "No logo yet"). It's HTML on top
  // of the sheet, not part of the SVG, so it can never be exported.
  const dropBox = h('button', { type: 'button', class: 'logo-drop', title: 'Upload the client logo' }, 'Drop logo here')
  sheet.append(svgHolder, dropBox)
  const stage = h('main', { class: 'stage' }, sheet)
  // Logo upload: one hidden file input shared by the Upload button and the drop box.
  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml', hidden: true })
  const pickLogo = () => fileInput.click()
  const inspector = createInspector(store, selection, pickLogo)
  const right = h('aside', { class: 'panel panel--inspector', 'aria-label': 'Inspector' }, inspector.root)
  const small = h('div', { class: 'too-small' }, 'The editor needs a screen at least 1024 px wide. Exported mockups can be viewed on any device.')

  const app = h('div', { class: 'editor' }, topbar, banner, h('div', { class: 'workspace' }, layers, stage, right))
  root.replaceChildren(app, small, fileInput)
  const toast = createToasts(app)

  async function uploadLogo(file: File) {
    const checked = await checkLogoFile(file)
    if (!checked.ok) return toast(checked.message, 'error')
    try {
      const { width, height, palette } = await readImage(checked.dataUrl)
      const asset = { name: file.name.slice(0, 200), mime: checked.mime, dataUrl: checked.dataUrl, width, height, palette }
      store.dispatch({ type: 'setLogo', id: newId('logo'), asset })
    } catch {
      toast("That image couldn't be read. Try exporting it again as PNG.", 'error')
    }
  }
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    fileInput.value = '' // so picking the same file again still fires change
    if (f) void uploadLogo(f)
  })
  dropBox.addEventListener('click', pickLogo)
  dropBox.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropBox.classList.add('logo-drop--over')
  })
  dropBox.addEventListener('dragleave', () => dropBox.classList.remove('logo-drop--over'))
  dropBox.addEventListener('drop', (e) => {
    e.preventDefault()
    dropBox.classList.remove('logo-drop--over')
    const f = e.dataTransfer?.files[0]
    if (f) void uploadLogo(f)
  })

  layersToggle.addEventListener('click', () => app.classList.toggle('editor--layers-open'))

  // ---------- linked-zone highlight (B5) ----------
  let hoverZone: ZoneId | null = null

  function paintHighlights() {
    const sel = selection.get()
    for (const n of sheet.querySelectorAll('.is-hover, .is-selected')) n.classList.remove('is-hover', 'is-selected')
    if (hoverZone) for (const n of sheet.querySelectorAll(`[data-zone="${hoverZone}"]`)) n.classList.add('is-hover')
    if (sel?.kind === 'zone') for (const n of sheet.querySelectorAll(`[data-zone="${sel.zone}"]`)) n.classList.add('is-selected')
  }

  const zoneOf = (e: Event) => (e.target as Element).closest?.('[data-zone]')?.getAttribute('data-zone') as ZoneId | undefined

  sheet.addEventListener('pointerover', (e) => {
    const z = zoneOf(e) ?? null
    if (z === hoverZone) return
    hoverZone = z
    paintHighlights()
  })
  sheet.addEventListener('pointerleave', () => {
    hoverZone = null
    paintHighlights()
  })
  svgHolder.addEventListener('click', (e) => {
    const z = zoneOf(e)
    selection.set(z ? { kind: 'zone', zone: z } : null) // clicking empty sheet deselects
  })
  stage.addEventListener('click', (e) => {
    if (e.target === stage) selection.set(null) // the grey surround deselects too
  })

  const selectFromLayers = (e: Event) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-select]')
    if (row) selection.set(parseSelectKey(row.dataset.select!))
  }
  layers.addEventListener('click', selectFromLayers)
  layers.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectFromLayers(e)
    }
  })

  function update() {
    const m = store.get()
    // A selection can point at something an undo just removed (e.g. grip dots).
    const sel = selection.get()
    if ((sel?.kind === 'gripDots' && !m.patterns.gripDots) || (sel?.kind === 'motif' && !m.patterns.motif)) {
      selection.set(null)
      return // selection.set triggers update again
    }
    svgHolder.replaceChildren(render(m))
    dropBox.hidden = Boolean(m.header.logoAssetId)
    paintHighlights()
    layers.replaceChildren(renderLayers(m, selectKey(selection.get())))
    inspector.sync(m)
    undo.disabled = !store.canUndo()
    redo.disabled = !store.canRedo()
  }
  store.subscribe(update)
  selection.subscribe(update)
  update()

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    const inField = t.matches('input, textarea, select, [contenteditable]')
    if (e.key === 'Escape' && !inField) {
      selection.set(null)
      return
    }
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
    // Leave undo inside text fields to the browser, so it undoes typing, not the sheet.
    if (inField) return
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
  })

  return {
    setAutosaveOk(ok: boolean) {
      banner.hidden = ok
    },
    selection,
    uploadLogo,
  }
}
