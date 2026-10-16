// Editor shell (design brief B2): top bar, Layers (left), sheet (centre), Inspector (right).
// The sheet is re-rendered from state on every change; the editor never edits the SVG itself.
// Hover/selection highlights are CSS classes on the rendered nodes, styled by the page's CSS,
// so they can never end up in an export (B1.4).

import { newId } from '../model/defaults'
import type { Mockup, Placement, ZoneId } from '../model/types'
import { copyPng, downloadBlob, exportFileName, exportPng } from '../io/export-png'
import { isMockupFile, nextSample, saveMockupFile } from '../io/file'
import { checkLogoFile } from '../io/upload'
import { readImage } from '../util/palette'
import { render } from '../render/sheet'
import type { Store } from '../store/store'
import { h } from './dom'
import { viewCentre } from './geometry'
import { startInlineEdit } from './inline-edit'
import { hasWork, openStartDialog, readMockupFile, type StartDialogOptions } from './start-dialog'
import { createInspector } from './inspector'
import { renderLayers } from './layers'
import { DEFAULT_GRIP, DEFAULT_MOTIF } from './panels'
import { createOverlay } from './overlay'
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
const selectKey = (s: Selection) =>
  s === null ? null : s.kind === 'zone' ? `zone:${s.zone}` : s.kind === 'placement' ? `placement:${s.id}` : s.kind

function parseSelectKey(key: string): Selection {
  if (key.startsWith('zone:')) return { kind: 'zone', zone: key.slice(5) as ZoneId }
  if (key.startsWith('placement:')) return { kind: 'placement', id: key.slice(10) }
  if (key === 'gripDots' || key === 'motif' || key === 'header') return { kind: key }
  if (key === 'sheet') return null // the sheet settings show when nothing is selected
  return null
}

let unmountPrevious: (() => void) | null = null

export function mountEditor(root: HTMLElement, store: Store) {
  // One editor per page. Mounting again (tests, or a future hot reload) removes the previous
  // editor's window/document listeners first, so they can't act twice or keep stale state.
  unmountPrevious?.()
  const lifetime = new AbortController()
  const listen = { signal: lifetime.signal }
  unmountPrevious = () => lifetime.abort()
  const selection = createSelection()

  const undo = button('↶ Undo', { title: 'Undo (Ctrl+Z)' })
  const redo = button('↷ Redo', { title: 'Redo (Ctrl+Shift+Z)' })
  undo.addEventListener('click', () => store.undo())
  redo.addEventListener('click', () => store.redo())

  // Main menu: new from a sock style, open a file, resume the draft (task 14).
  const menuBtn = button('☰ Menu', { title: 'Main menu: new mockup from a sock style, or open a file' })
  menuBtn.classList.add('topbar__menu')

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

  const openBtn = button('Open', { title: 'Open a .sockmockup.json file (or drop one on the window)' })
  const saveBtn = button('Save', { title: 'Save as a .sockmockup.json file (Ctrl+S)' })
  const dupBtn = button('Dup → next', { title: 'Save this file, then start the next SAMPLE with everything copied' })

  const addLogoBtn = button('+ Logo', { title: 'Put the client logo on the sock' })
  const addTextBtn = button('+ Text', { title: 'Add a text wordmark to the sock' })

  // Export ▾ (B4: the one filled primary button): PNG download, Copy PNG; PDF comes in task 16.
  const exportBtn = button('Export ▾', { primary: true, title: 'Export the sheet (Ctrl+E = PNG)' })
  exportBtn.setAttribute('aria-haspopup', 'menu')
  exportBtn.setAttribute('aria-expanded', 'false')
  const exportItem = (label: string, title?: string, disabled = false) =>
    h('button', { type: 'button', class: 'menu__item', role: 'menuitem', title, disabled }, label)
  const pngItem = exportItem('Download PNG (2048 × 1536)')
  const copyItem = exportItem('Copy PNG (paste into an email)')
  const pdfItem = exportItem('Download PDF (vector, for the factory)')
  const exportList = h('div', { class: 'menu', role: 'menu', hidden: true }, pngItem, copyItem, pdfItem)
  const exportMenu = h('div', { class: 'menu-wrap' }, exportBtn, exportList)
  const setExportOpen = (open: boolean) => {
    exportList.hidden = !open
    exportBtn.setAttribute('aria-expanded', String(open))
  }
  exportBtn.addEventListener('click', () => setExportOpen(exportList.hidden))
  document.addEventListener('click', (e) => {
    if (!exportMenu.contains(e.target as Node)) setExportOpen(false)
  }, listen)


  const topbar = h(
    'header',
    { class: 'topbar' },
    group(menuBtn, layersToggle, openBtn, saveBtn, dupBtn),
    group(undo, redo),
    group(addLogoBtn, addTextBtn, dots, motifBtn),
    h('div', { class: 'topbar__spacer' }),
    group(exportMenu),
  )

  const banner = h('div', { class: 'banner', role: 'status', hidden: true }, 'Draft not autosaved — use Save.')
  const layers = h('aside', { class: 'panel panel--layers', 'aria-label': 'Layers' })
  const sheet = h('div', { class: 'sheet' })
  const svgHolder = h('div', { class: 'sheet__svg' })
  // Editor-only drop box over the header logo spot (app-flow "No logo yet"). It's HTML on top
  // of the sheet, not part of the SVG, so it can never be exported.
  const dropBox = h('button', { type: 'button', class: 'logo-drop', title: 'Upload the client logo' }, 'Drop logo here')
  const overlay = createOverlay(store, selection, lifetime.signal)
  sheet.append(svgHolder, overlay.svg, dropBox)
  const stage = h('main', { class: 'stage' }, sheet)
  // Logo upload: one hidden file input shared by the Upload button and the drop box.
  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml', hidden: true })
  const pickLogo = () => fileInput.click()
  const inspector = createInspector(store, selection, pickLogo, lifetime.signal, (name) =>
    toast(`Switched to ${name}. Spec lines reset to its defaults (Ctrl+Z to undo).`),
  )
  const right = h('aside', { class: 'panel panel--inspector', 'aria-label': 'Inspector' }, inspector.root)
  const small = h('div', { class: 'too-small' }, 'The editor needs a screen at least 1024 px wide. Exported mockups can be viewed on any device.')

  const app = h('div', { class: 'editor' }, topbar, banner, h('div', { class: 'workspace' }, layers, stage, right))
  const toast = createToasts(app)
  root.replaceChildren(app, small, fileInput)

  // ---------- adding placements ----------
  let lastView = 0 // "the selected view" for + Logo / + Text: the last view clicked on
  let placeAfterUpload = false

  function addPlacement(content: Placement['content']) {
    placeAfterUpload = false
    const m = store.get()
    const kind = m.views[lastView].kind
    const id = newId('place')
    const placement: Placement = { id, view: lastView, content, ...viewCentre(m, lastView), scale: content.type === 'image' ? 0.8 : 1, rotation: 0, clip: true }
    // PRD 5.6: on Left/Right the mirrored copy goes on the other side by default.
    store.dispatch({ type: 'addPlacement', placement, mirrorId: kind === 'left' || kind === 'right' ? newId('place') : undefined })
    selection.set({ kind: 'placement', id })
  }
  addLogoBtn.addEventListener('click', () => {
    const logo = store.get().header.logoAssetId
    if (logo) return addPlacement({ type: 'image', assetId: logo })
    placeAfterUpload = true // no logo yet: upload one, then place it
    pickLogo()
  })
  addTextBtn.addEventListener('click', () =>
    addPlacement({ type: 'text', text: store.get().header.client.split(/\s+/)[0]?.toUpperCase() || 'TEXT', font: 'arimo', color: { hex: '#000000' } }),
  )

  async function uploadLogo(file: File) {
    const checked = await checkLogoFile(file)
    if (!checked.ok) return toast(checked.message, 'error')
    try {
      const read = await readImage(checked.dataUrl)
      // Only the aspect ratio matters; keep within the file schema's 20,000 px so it reloads.
      const k = Math.min(1, 20000 / Math.max(read.width, read.height))
      const width = Math.max(1, Math.round(read.width * k))
      const height = Math.max(1, Math.round(read.height * k))
      const asset = { name: file.name.slice(0, 200), mime: checked.mime, dataUrl: checked.dataUrl, width, height, palette: read.palette }
      store.dispatch({ type: 'setLogo', id: newId('logo'), asset })
      if (placeAfterUpload) addPlacement({ type: 'image', assetId: store.get().header.logoAssetId! })
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
    if (!f) return
    if (isMockupFile(f)) void openFile(f) // a mockup file dropped here means "open it"
    else void uploadLogo(f)
  })

  layersToggle.addEventListener('click', () => app.classList.toggle('editor--layers-open'))

  // ---------- files (task 17) ----------
  // Unsaved = there's work, and it isn't the state last saved to (or opened from) a file. Undoing
  // back to that state counts as saved again, since the store reuses the same object.
  let lastSaved: Mockup | null = null
  // Once there's a saved file, compare against it; before that, anything beyond an untouched style.
  const isUnsaved = () => (lastSaved ? store.get() !== lastSaved : hasWork(store.get()))

  /** Finish a text edit / stop a drag before the document is replaced, so neither can write into it. */
  const endInteractions = () => {
    sheet.querySelector<HTMLInputElement>('.inline-edit')?.blur()
    overlay.cancelDrag()
  }
  const markSaved = () => (lastSaved = store.get())

  const openInput = h('input', { type: 'file', accept: '.json,.sockmockup.json,application/json', hidden: true })
  // Inline confirmation bar for Open over unsaved work (no browser popups, design brief).
  const confirmBar = h('div', { class: 'confirm-bar', role: 'alertdialog', hidden: true })
  app.insertBefore(confirmBar, banner)
  root.append(openInput)
  function askToReplace(text: string, go: () => void) {
    const yes = h('button', { type: 'button', class: 'btn btn--primary' }, 'Open it')
    const no = h('button', { type: 'button', class: 'btn btn--outline' }, 'Cancel')
    yes.addEventListener('click', () => {
      confirmBar.hidden = true
      go()
    })
    no.addEventListener('click', () => (confirmBar.hidden = true))
    confirmBar.replaceChildren(h('span', {}, text), yes, no)
    confirmBar.hidden = false
    yes.focus()
  }

  function saveNow(): string {
    const name = saveMockupFile(store.get())
    markSaved()
    toast(`Saved ${name}`)
    return name
  }

  async function openFile(file: File) {
    const r = await readMockupFile(file)
    if (!r.ok) return toast(r.message, 'error') // the current mockup stays untouched
    const go = () => {
      endInteractions()
      selection.set(null)
      store.load(r.mockup)
      markSaved()
      toast(`Opened ${file.name}`)
    }
    if (isUnsaved()) askToReplace(`Open ${file.name}? ${store.get().header.client || 'The current mockup'} has unsaved changes.`, go)
    else go()
  }

  openBtn.addEventListener('click', () => openInput.click())
  openInput.addEventListener('change', () => {
    const f = openInput.files?.[0]
    openInput.value = ''
    if (f) void openFile(f)
  })
  saveBtn.addEventListener('click', () => void saveNow())
  dupBtn.addEventListener('click', () => {
    // App-flow Journey 3: the current file is saved first, then SAMPLE n+1 starts.
    endInteractions()
    saveNow()
    const next = nextSample(store.get())
    selection.set(null)
    // An undo step, not a fresh history: the browser can't confirm the download finished, so if
    // it was blocked, Ctrl+Z brings the previous sample back.
    store.dispatch({ type: 'replaceAll', mockup: next })
    const tag = next.header.tag
    toast(tag.mode === 'sample' ? `Saved. Now on SAMPLE ${tag.n} (Ctrl+Z to go back).` : 'Saved. Started a copy (style-code tag kept).')
  })

  // Drop a .sockmockup.json anywhere on the window to open it (logos go on the logo box).
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  }, listen)
  window.addEventListener('drop', (e) => {
    if (e.defaultPrevented) return // the logo drop box already handled it
    const f = e.dataTransfer?.files[0]
    if (!f) return
    e.preventDefault()
    if (isMockupFile(f)) void openFile(f)
    else toast('To add a logo, drop it on the logo box in the header.', 'error')
  }, listen)

  // Browser's standard "Leave site?" prompt when there are unsaved changes (app-flow states).
  window.addEventListener('beforeunload', (e) => {
    if (!isUnsaved()) return
    e.preventDefault()
    e.returnValue = '' // still needed by some browsers to show the prompt
  }, listen)

  function openMenu(opts: Partial<Pick<StartDialogOptions, 'canClose' | 'draft'>> = {}) {
    endInteractions()
    selection.set(null)
    openStartDialog(app, {
      store,
      canClose: opts.canClose ?? true,
      draft: opts.draft,
      onDone: (message) => {
        if (message) toast(message)
        menuBtn.focus()
      },
      onError: (message) => toast(message, 'error'),
      isUnsaved,
      onOpened: markSaved,
      onNew: () => (lastSaved = null),
      signal: lifetime.signal,
    })
  }
  menuBtn.addEventListener('click', () => openMenu())

  // ---------- export (task 15) ----------
  let exporting = false
  let exportHook: () => void = () => void runExport('png') // replaceable in tests (jsdom has no canvas)
  async function runExport(kind: 'png' | 'copy' | 'pdf') {
    if (exporting) return
    exporting = true
    setExportOpen(false)
    exportBtn.disabled = true
    exportBtn.classList.add('btn--busy') // spinner (B6)
    const m = store.get()
    const name = exportFileName(m, 'png')
    try {
      if (kind === 'pdf') {
        // Loaded on first use only: jsPDF + svg2pdf are most of the bundle (TDD §9).
        const { exportPdf } = await import('../io/export-pdf')
        const pdfName = exportFileName(m, 'pdf')
        downloadBlob(await exportPdf(m), pdfName)
        toast(`Exported ${pdfName}`)
      } else if (kind === 'copy') {
        const png = exportPng(m)
        if (await copyPng(png)) toast('Copied. Paste it into your email.')
        else {
          downloadBlob(await png, name)
          toast('Your browser blocked copying. Downloading the PNG instead.')
        }
      } else {
        downloadBlob(await exportPng(m), name)
        toast(`Exported ${name}`)
      }
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}. Your mockup is safe; try again or Save the file.`, 'error')
    } finally {
      exporting = false
      exportBtn.disabled = false
      exportBtn.classList.remove('btn--busy')
    }
  }
  pngItem.addEventListener('click', () => void runExport('png'))
  copyItem.addEventListener('click', () => void runExport('copy'))
  pdfItem.addEventListener('click', () => void runExport('pdf'))

  // ---------- linked-zone highlight (B5) ----------
  let hoverZone: ZoneId | null = null

  function paintHighlights() {
    const sel = selection.get()
    for (const n of sheet.querySelectorAll('.is-hover, .is-selected')) n.classList.remove('is-hover', 'is-selected')
    // Stroke-drawn stripes are skipped: the highlight's own stroke would repaint them.
    if (hoverZone) for (const n of sheet.querySelectorAll(`[data-zone="${hoverZone}"]:not([data-stroke])`)) n.classList.add('is-hover')
    if (sel?.kind === 'zone') for (const n of sheet.querySelectorAll(`[data-zone="${sel.zone}"]:not([data-stroke])`)) n.classList.add('is-selected')
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
  // Pressing on a logo selects it and starts a move straight away (no separate click needed).
  let pressedPlacement = false
  // What the pointer went down on, read while that element still exists. Pressing the sheet can
  // blur a text field, which ends its edit and redraws the sheet before the click arrives; the
  // click then lands on the sheet holder and would read as "empty space" (found in Chrome).
  type Hit = { field: string | null; header: boolean; zone: ZoneId | null }
  const hitOf = (el: Element): Hit => ({
    field: el.closest?.('[data-field]')?.getAttribute('data-field') ?? null,
    header: Boolean(el.closest?.('[data-part="header"]')),
    zone: (el.closest?.('[data-zone]')?.getAttribute('data-zone') as ZoneId | undefined) ?? null,
  })
  let pressed: Hit | null = null
  // Double-press detection is done here, not with the dblclick event: the first press can
  // re-render the sheet, and then the browser no longer sees two clicks on the same element.
  let lastPress = { id: '', at: 0 }
  const DOUBLE_PRESS_MS = 400
  svgHolder.addEventListener('pointerdown', (e) => {
    const target = e.target as Element
    const view = target.closest('[data-view]')?.getAttribute('data-view')
    if (view !== null && view !== undefined) lastView = Number(view)
    const id = target.closest('[data-placement]')?.getAttribute('data-placement')
    pressedPlacement = Boolean(id)
    pressed = hitOf(target)
    if (!id || e.button !== 0) return
    e.preventDefault()
    const double = lastPress.id === id && e.timeStamp - lastPress.at < DOUBLE_PRESS_MS
    lastPress = { id, at: e.timeStamp }
    selection.set({ kind: 'placement', id })
    const text = sheet.querySelector(`[data-field="placement:${id}"]`)
    if (double && text) {
      lastPress = { id: '', at: 0 }
      startInlineEdit(store, sheet, text)
      return
    }
    overlay.startDrag('move', id, e)
  })
  // Handled on pointerup, not click: if the press redrew the sheet, Chrome fires no click at all
  // (the press and release targets no longer share a parent in the page). `click` remains as a
  // fallback for clicks that don't come with pointer events; `handledUp` stops a double handling.
  let handledUp = false
  // A press released (or cancelled) anywhere ends here too, so stale press state can't swallow
  // a later click. Deferred so the click belonging to this same press still sees it.
  const endPress = () =>
    setTimeout(() => {
      pressedPlacement = false
      pressed = null
    })
  window.addEventListener('pointerup', endPress, listen)
  window.addEventListener('pointercancel', endPress, listen)
  svgHolder.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !pressed) return
    handledUp = true
    setTimeout(() => (handledUp = false))
    activate(e)
  })
  svgHolder.addEventListener('click', (e) => {
    if (handledUp) return
    activate(e)
  })
  function activate(e: Event) {
    // The re-render during a drag means the click lands on an ancestor, not the logo; ignore it.
    if (pressedPlacement) {
      pressedPlacement = false
      pressed = null
      return
    }
    const hit = pressed ?? hitOf(e.target as Element)
    pressed = null
    // Click any header text or view label to type over it in place (task 13b).
    if (hit.field && !hit.field.startsWith('placement:')) {
      // Selecting the header re-renders the sheet; measure the field's new element, not the
      // removed one (which would put the edit box in the wrong place).
      if (hit.header) selection.set({ kind: 'header' })
      const live = [...sheet.querySelectorAll('[data-field]')].find((n) => n.getAttribute('data-field') === hit.field)
      if (live) startInlineEdit(store, sheet, live)
      return
    }
    if (hit.header) return selection.set({ kind: 'header' })
    selection.set(hit.zone ? { kind: 'zone', zone: hit.zone } : null) // clicking empty sheet deselects
  }
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
    const gone =
      (sel?.kind === 'gripDots' && !m.patterns.gripDots) ||
      (sel?.kind === 'motif' && !m.patterns.motif) ||
      (sel?.kind === 'placement' && !m.placements.some((p) => p.id === sel.id))
    if (gone) {
      selection.set(null)
      return // selection.set triggers update again
    }
    svgHolder.replaceChildren(render(m))
    dropBox.hidden = Boolean(m.header.logoAssetId)
    paintHighlights()
    overlay.draw()
    layers.replaceChildren(renderLayers(m, selectKey(selection.get())))
    inspector.sync(m)
    undo.disabled = !store.canUndo()
    redo.disabled = !store.canRedo()
  }
  const unsubscribe = [store.subscribe(update), selection.subscribe(update)]
  lifetime.signal.addEventListener('abort', () => unsubscribe.forEach((u) => u()))
  update()

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    const inField = t.matches('input, textarea, select, [contenteditable]')
    if (e.key === 'Escape' && !inField) {
      selection.set(null)
      return
    }
    const sel = selection.get()
    if (sel?.kind === 'placement' && !inField) {
      const p = store.get().placements.find((q) => q.id === sel.id)
      if (!p) return
      const step = e.shiftKey ? 10 : 1
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      if (nudge[e.key]) {
        e.preventDefault()
        const [dx, dy] = nudge[e.key]
        store.dispatch({ type: 'updatePlacement', id: p.id, patch: { x: p.x + dx, y: p.y + dy } })
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        store.dispatch({ type: 'removePlacement', id: p.id })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault() // Ctrl+D would otherwise bookmark the page
        const id = newId('place')
        const kind = store.get().views[p.view].kind
        const { mirrorOf: _, ...copy } = structuredClone(p)
        store.dispatch({
          type: 'addPlacement',
          placement: { ...copy, id, x: p.x + 12, y: p.y + 12 },
          mirrorId: (kind === 'left' || kind === 'right') && store.get().placements.some((q) => q.mirrorOf === p.id || p.mirrorOf === q.id) ? newId('place') : undefined,
        })
        selection.set({ kind: 'placement', id })
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault() // Ctrl+S = save file (app-flow keyboard table), not the browser's "save page"
      saveNow()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault() // Ctrl+E = export PNG (app-flow keyboard table)
      exportHook()
      return
    }
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
    // Leave undo inside text fields to the browser, so it undoes typing, not the sheet.
    if (inField) return
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
  }, listen)

  return {
    setAutosaveOk(ok: boolean) {
      banner.hidden = ok
    },
    selection,
    uploadLogo,
    toast,
    openMenu,
    isUnsaved,
    openFile,
    runExport,
    setExportHook(fn: () => void) {
      exportHook = fn
    },
  }
}
