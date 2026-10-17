// Editor shell (design brief B2): top bar, Layers (left), sheet (centre), Inspector (right).
// The sheet is re-rendered from state on every change; the editor never edits the SVG itself.
// Hover/selection highlights are CSS classes on the rendered nodes, styled by the page's CSS,
// so they can never end up in an export (B1.4).

import { newId, STYLE_PRESETS } from '../model/defaults'
import type { Mockup, Placement, ZoneId } from '../model/types'
import { copyPng, downloadBlob, exportFileName, exportPng } from '../io/export-png'
import { isMockupFile, nextSample, saveWorkbookFile } from '../io/file'
import { checkLogoFile } from '../io/upload'
import { readImage } from '../util/palette'
import { render } from '../render/sheet'
import type { Store } from '../store/store'
import { createWorkbook } from '../store/workbook'
import { defaultSheetName, type WorkbookData } from '../model/workbook'
import { createSheetTabs } from './sheet-tabs'
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

/**
 * A fresh mockup in the same sock style as `m` (the preset with the same sock and views, and
 * the same style code if it has one), keeping the client name and header logo.
 */
export function blankLike(m: Mockup): Mockup {
  const kinds = (x: Mockup) => x.views.map((v) => v.kind).join()
  const score = (p: Mockup) =>
    (p.template === m.template ? 4 : 0) +
    (kinds(p) === kinds(m) ? 2 : 0) +
    (p.header.tag.mode === m.header.tag.mode ? 1 : 0) +
    (Boolean(p.patterns.gripDots) === Boolean(m.patterns.gripDots) ? 1 : 0)
  const fresh = Object.values(STYLE_PRESETS)
    .map((p) => p.make())
    .reduce((best, p) => (score(p) > score(best) ? p : best))
  fresh.header.client = m.header.client
  const logoId = m.header.logoAssetId
  if (logoId && m.assets[logoId]) {
    fresh.assets[logoId] = m.assets[logoId]
    fresh.header.logoAssetId = logoId
  }
  if (m.header.tag.mode === 'code' && fresh.header.tag.mode === 'code') fresh.header.tag = { ...m.header.tag }
  return fresh
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
  const workbook = createWorkbook(store, defaultSheetName(store.get(), 0))

  const undo = button('↶ Undo', { title: 'Undo (Ctrl+Z)' })
  const redo = button('↷ Redo', { title: 'Redo (Ctrl+Shift+Z)' })
  undo.addEventListener('click', () => store.undo())
  redo.addEventListener('click', () => store.redo())

  // Main menu: new from a sock style, open a file, resume the draft (task 14).
  // Main menu ▾: file and sheet commands in one place (the tab bar and top bar are shortcuts).
  const menuBtn = button('☰ Menu', { title: 'New, open, save; add, rename or delete sheets' })
  menuBtn.classList.add('topbar__menu')
  menuBtn.setAttribute('aria-haspopup', 'menu')
  menuBtn.setAttribute('aria-expanded', 'false')
  const menuItem = (label: string, title?: string) => h('button', { type: 'button', class: 'menu__item', role: 'menuitem', title }, label)
  const newItem = menuItem('New mockup…', 'Start from a sock style (replaces this file)')
  const openItem = menuItem('Open file…', 'Open a .sockmockup.json file')
  const saveItem = menuItem('Save file', 'Save every sheet in one file (Ctrl+S)')
  const addSheetItem = menuItem('Add sheet', 'A fresh sheet in this sock style, with the same client and logo')
  const dupSheetItem = menuItem('Duplicate to new sheet', 'A copy of this sheet as the next SAMPLE, in a new tab')
  const renameSheetItem = menuItem('Rename sheet', 'Rename this sheet’s tab (or double-click the tab)')
  const deleteSheetItem = menuItem('Delete sheet', 'Delete this sheet')
  const mainList = h(
    'div',
    { class: 'menu menu--left', role: 'menu', hidden: true },
    newItem,
    openItem,
    saveItem,
    h('hr', { class: 'menu__sep' }),
    addSheetItem,
    dupSheetItem,
    renameSheetItem,
    deleteSheetItem,
  )
  const mainMenu = h('div', { class: 'menu-wrap' }, menuBtn, mainList)
  const setMainOpen = (open: boolean) => {
    mainList.hidden = !open
    menuBtn.setAttribute('aria-expanded', String(open))
  }

  const layersToggle = button('Layers', { title: 'Show or hide the Layers panel' })
  layersToggle.classList.add('topbar__layers-toggle')

  // Dots / Motif add the pattern if it isn't there yet, then select it so its settings show.
  const dots = button('Dots', { title: 'Grip dots on the sole' })
  dots.addEventListener('click', () => {
    if (!store.get().patterns.gripDots) store.dispatch({ type: 'setGripDots', gripDots: structuredClone(DEFAULT_GRIP) })
    selection.set({ kind: 'gripDots' })
  })
  const motifBtn = button('Motif', { title: 'Repeat a letter, word or image across the sock' })
  motifBtn.addEventListener('click', () => {
    if (!store.get().patterns.motif) store.dispatch({ type: 'setMotif', motif: structuredClone(DEFAULT_MOTIF) })
    selection.set({ kind: 'motif' })
  })


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
    group(mainMenu, layersToggle),
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
  const tabs = createSheetTabs(workbook, {
    beforeSwitch: () => {
      endInteractions()
      selection.set(null)
    },
    duplicate: () => duplicateSheet(),
    confirm: (text, yesLabel, go) => askToReplace(text, go, yesLabel),
  })
  // Logo upload: one hidden file input shared by the Upload button and the drop box.
  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml', hidden: true })
  const pickLogo = () => fileInput.click()
  const inspector = createInspector(store, selection, pickLogo, lifetime.signal, (name) =>
    toast(`Switched to ${name}. Spec lines reset to its defaults (Ctrl+Z to undo).`),
    (message) => toast(message, 'error'),
  )
  const right = h('aside', { class: 'panel panel--inspector', 'aria-label': 'Inspector' }, inspector.root)
  const small = h('div', { class: 'too-small' }, 'The editor needs a screen at least 1024 px wide. Exported mockups can be viewed on any device.')

  const app = h('div', { class: 'editor' }, topbar, banner, h('div', { class: 'workspace' }, layers, h('div', { class: 'stage-col' }, stage, tabs.root), right))
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
  // Once there's a saved file, compare against it; before that, anything beyond one untouched style.
  let lastSavedSig: unknown[] | null = null
  const isUnsaved = () => {
    const sig = workbook.signature()
    if (lastSavedSig) return sig.length !== lastSavedSig.length || sig.some((x, i) => x !== lastSavedSig![i])
    const { sheets } = workbook.data()
    return sheets.length > 1 || sheets.some((sh, i) => hasWork(sh.mockup) || sh.name !== defaultSheetName(sh.mockup, i))
  }

  /** Finish a text edit / stop a drag before the document is replaced, so neither can write into it. */
  const endInteractions = () => {
    sheet.querySelector<HTMLInputElement>('.inline-edit')?.blur()
    overlay.cancelDrag()
  }
  const markSaved = () => (lastSavedSig = workbook.signature())

  const openInput = h('input', { type: 'file', accept: '.json,.sockmockup.json,application/json', hidden: true })
  // Inline confirmation bar for Open over unsaved work (no browser popups, design brief).
  const confirmBar = h('div', { class: 'confirm-bar', role: 'alertdialog', hidden: true })
  app.insertBefore(confirmBar, banner)
  root.append(openInput)
  function askToReplace(text: string, go: () => void, yesLabel = 'Open it') {
    const yes = h('button', { type: 'button', class: 'btn btn--primary' }, yesLabel)
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
    const name = saveWorkbookFile(workbook.data())
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
      workbook.load(r.workbook)
      markSaved()
      toast(`Opened ${file.name}`)
    }
    if (isUnsaved()) askToReplace(`Open ${file.name}? ${store.get().header.client || 'The current mockup'} has unsaved changes.`, go)
    else go()
  }

  openInput.addEventListener('change', () => {
    const f = openInput.files?.[0]
    openInput.value = ''
    if (f) void openFile(f)
  })
  // App-flow Journey 3, with tabs: SAMPLE n+1 is a copy of this sheet in a new tab, and the
  // previous sample stays in its own tab, so nothing is lost and no download is needed.
  /** A fresh sheet in the open sheet's sock style; the client name and logo carry over. */
  function addBlankSheet() {
    endInteractions()
    if (!workbook.canAdd()) return toast('That is the most sheets one file can hold.', 'error')
    const cur = store.get()
    const m = blankLike(cur)
    selection.set(null)
    const name = `Sheet ${workbook.list().length + 1}`
    workbook.add({ name, mockup: m })
    toast(`Added ${name}.`)
  }
  function duplicateSheet() {
    endInteractions()
    if (!workbook.canAdd()) return toast('That is the most sheets one file can hold.', 'error')
    const next = nextSample(store.get())
    selection.set(null)
    const name = next.header.tag.mode === 'sample' ? `SAMPLE ${next.header.tag.n}` : `${workbook.list().find((t) => t.active)!.name} copy`
    workbook.add({ name, mockup: next })
    toast(`Added ${name}. The previous sheet is still in its tab.`)
  }

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
      load: (wb: WorkbookData) => workbook.load(wb),
      canClose: opts.canClose ?? true,
      draft: opts.draft,
      onDone: (message) => {
        if (message) toast(message)
        menuBtn.focus()
      },
      onError: (message) => toast(message, 'error'),
      isUnsaved,
      onOpened: markSaved,
      onNew: () => (lastSavedSig = null),
      signal: lifetime.signal,
    })
  }
  menuBtn.addEventListener('click', () => {
    if (mainList.hidden) {
      // Delete only makes sense with more than one sheet.
      deleteSheetItem.disabled = workbook.list().length === 1
      addSheetItem.disabled = dupSheetItem.disabled = !workbook.canAdd()
    }
    setMainOpen(mainList.hidden)
  })
  document.addEventListener('click', (e) => {
    if (!mainMenu.contains(e.target as Node)) setMainOpen(false)
  }, listen)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mainList.hidden) {
      setMainOpen(false)
      menuBtn.focus()
    }
  }, listen)
  const fromMenu = (fn: () => void) => () => {
    setMainOpen(false)
    fn()
  }
  newItem.addEventListener('click', fromMenu(() => openMenu()))
  openItem.addEventListener('click', fromMenu(() => openInput.click()))
  saveItem.addEventListener('click', fromMenu(() => void saveNow()))
  addSheetItem.addEventListener('click', fromMenu(() => addBlankSheet()))
  dupSheetItem.addEventListener('click', fromMenu(() => duplicateSheet()))
  renameSheetItem.addEventListener('click', fromMenu(() => tabs.renameActive()))
  deleteSheetItem.addEventListener('click', fromMenu(() => tabs.deleteActive()))

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
        // One page per sheet tab, in tab order: the factory gets every sample in one file.
        const all = workbook.data().sheets.map((sh) => sh.mockup)
        downloadBlob(await exportPdf(all), pdfName)
        toast(all.length > 1 ? `Exported ${pdfName} (${all.length} pages)` : `Exported ${pdfName}`)
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
    // A click that lands on a specific part is trusted as is. The press recorded at pointerdown is
    // only for clicks that land on the sheet background because a redraw replaced the element.
    const direct = hitOf(e.target as Element)
    const hit = direct.field || direct.zone || direct.header ? direct : (pressed ?? direct)
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
  const unsubscribe = [store.subscribe(update), selection.subscribe(update), workbook.subscribe(tabs.draw)]
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
    workbook,
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
