// Main menu / start dialog (app-flow "Start dialog", engineering-plan task 14): new from a style
// preset, open a .sockmockup.json file, or resume the autosaved draft. Built from plain DOM so it
// works the same in every browser (no <dialog> quirks) and needs no confirm() popups.

import { STYLE_PRESETS, type StylePresetId } from '../model/defaults'
import { migrate, MockupFileError } from '../model/schema'
import type { Mockup } from '../model/types'
import { render } from '../render/sheet'
import type { Store } from '../store/store'
import { h } from './dom'

export const OPEN_ERRORS = {
  damaged: "This file isn't a Sock Mockup Studio file (or it's damaged).",
  tooBig: 'That file is too big to be a mockup file.',
} as const
const MAX_FILE_BYTES = 60 * 1024 * 1024 // a mockup with several 10 MB logos, base64-encoded

/** Browser check that every embedded image actually decodes (the schema only checks its header). */
async function imagesDecode(m: Mockup): Promise<boolean> {
  if (typeof Image === 'undefined' || !('decode' in Image.prototype)) return true
  try {
    await Promise.all(
      Object.values(m.assets).map((a) => {
        const img = new Image()
        img.src = a.dataUrl
        return img.decode()
      }),
    )
    return true
  } catch {
    return false
  }
}

/** Read and validate a mockup file. Never throws: returns the mockup or the message to show. */
export async function readMockupFile(
  file: File,
  verifyImages: (m: Mockup) => Promise<boolean> = imagesDecode,
): Promise<{ ok: true; mockup: Mockup } | { ok: false; message: string }> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: OPEN_ERRORS.tooBig }
  try {
    const mockup = migrate(JSON.parse(await file.text()))
    // A file whose logo bytes are broken would open with a missing logo; refuse it whole instead.
    if (!(await verifyImages(mockup))) return { ok: false, message: OPEN_ERRORS.damaged }
    return { ok: true, mockup }
  } catch (e) {
    return { ok: false, message: e instanceof MockupFileError ? e.message : OPEN_ERRORS.damaged }
  }
}

function timeAgo(t: number, now = Date.now()): string {
  const min = Math.round((now - t) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(t).toLocaleDateString()
}

/** The mockup with generated ids blanked, so two copies of the same style compare equal. */
function withoutIds(m: Mockup): string {
  return JSON.stringify({ ...m, header: { ...m.header, specs: m.header.specs.map((r) => ({ ...r, id: '' })) } })
}

/**
 * True unless the mockup is exactly an untouched style preset. Comparing against the presets
 * catches every kind of edit (specs, title, tag, grip dots, colours...), not just a few fields.
 */
export function hasWork(m: Mockup): boolean {
  const mine = withoutIds(m)
  return !Object.values(STYLE_PRESETS).some((p) => withoutIds(p.make()) === mine)
}

export type StartDialogOptions = {
  store: Store
  /** Show "Back to current mockup" and allow Esc (false on first open of a fresh browser). */
  canClose: boolean
  /** Offered on boot when an autosaved draft exists. */
  draft?: { client: string; savedAt: number }
  onDone: (message?: string) => void
  onError: (message: string) => void
  /** Whether replacing the current mockup would lose work. Default: it has any work at all. */
  isUnsaved?: () => boolean
  /** Called when a file was opened (the shell then counts it as saved). */
  onOpened?: () => void
  /** Called when a new mockup was started from a style (nothing saved yet). */
  onNew?: () => void
  /** The editor's lifetime: when it ends, the menu goes too (no leftover key capture). */
  signal?: AbortSignal
}

export function openStartDialog(parent: HTMLElement, o: StartDialogOptions): HTMLElement | null {
  // One menu at a time.
  if (parent.querySelector('.start-backdrop')) return null
  // The editor behind the menu is inert: no Tab focus, no clicks, no typing into it.
  const behind = [...parent.children].filter((c): c is HTMLElement => c instanceof HTMLElement)
  behind.forEach((c) => c.setAttribute('inert', ''))
  let open = true
  const close = (message?: string) => {
    if (!open) return
    open = false // also cancels a file read still in progress (see the Open handler)
    backdrop.remove()
    behind.forEach((c) => c.removeAttribute('inert'))
    document.removeEventListener('keydown', onKey, true)
    o.onDone(message)
  }

  // Inline confirmation (no confirm() popups): picking a style while there's work on the sheet.
  const confirmBar = h('div', { class: 'start__confirm', hidden: true })
  const ask = (text: string, go: () => void) => {
    const yes = h('button', { type: 'button', class: 'btn btn--primary' }, 'Replace it')
    const no = h('button', { type: 'button', class: 'btn btn--outline' }, 'Cancel')
    yes.addEventListener('click', go)
    no.addEventListener('click', () => (confirmBar.hidden = true))
    confirmBar.replaceChildren(h('span', {}, text), yes, no)
    confirmBar.hidden = false
    yes.focus()
  }
  const replaceWith = (m: Mockup, message: string, opened: boolean) => {
    o.store.load(m)
    if (opened) o.onOpened?.()
    else o.onNew?.()
    close(message)
  }
  const unsaved = o.isUnsaved ?? (() => hasWork(o.store.get()))
  const guarded = (m: Mockup, message: string, opened = false) => {
    // Ask whenever there's unsaved work to lose, including a draft restored at boot.
    if (unsaved()) {
      const client = o.store.get().header.client || 'the current mockup'
      ask(`This replaces ${client}. It isn't saved to a file yet.`, () => replaceWith(m, message, opened))
    } else replaceWith(m, message, opened)
  }

  const cards = h('div', { class: 'start__cards' })
  for (const [id, preset] of Object.entries(STYLE_PRESETS) as [StylePresetId, (typeof STYLE_PRESETS)[StylePresetId]][]) {
    const thumb = h('div', { class: 'start__thumb', 'aria-hidden': 'true' })
    thumb.append(render(preset.make())) // the real render, so the picture always matches the style
    const card = h('button', { type: 'button', class: 'start__card', 'data-style': id }, thumb, h('span', { class: 'start__card-name' }, preset.name))
    card.addEventListener('click', () => guarded(preset.make(), `New ${preset.name} mockup.`))
    cards.append(card)
  }

  const fileInput = h('input', { type: 'file', accept: '.json,.sockmockup.json,application/json', hidden: true })
  const openBtn = h('button', { type: 'button', class: 'btn btn--outline start__action' }, 'Open file…')
  openBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0]
    fileInput.value = ''
    if (!f) return
    const r = await readMockupFile(f)
    if (!open) return // the menu was closed while reading: do nothing
    if (!r.ok) return o.onError(r.message) // the current mockup stays untouched
    guarded(r.mockup, `Opened ${f.name}.`, true)
  })

  const actions = h('div', { class: 'start__actions' }, openBtn, fileInput)
  if (o.draft) {
    const resume = h(
      'button',
      { type: 'button', class: 'btn btn--primary start__action', 'data-action': 'resume' },
      `Resume draft — ${o.draft.client || 'Untitled'} · edited ${timeAgo(o.draft.savedAt)}`,
    )
    // The draft is already loaded at boot; resuming just closes the menu, so it's exactly as left.
    resume.addEventListener('click', () => close())
    actions.prepend(resume)
  }
  if (o.canClose) {
    const back = h('button', { type: 'button', class: 'btn btn--outline start__action', 'data-action': 'back' }, 'Back to current mockup')
    back.addEventListener('click', () => close())
    actions.append(back)
  }

  const dialog = h(
    'div',
    { class: 'start', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'start-title' },
    h('h1', { class: 'start__title', id: 'start-title' }, 'Sock Mockup Studio'),
    h('p', { class: 'start__lead' }, 'Pick a sock style to start a new mockup.'),
    cards,
    confirmBar,
    actions,
  )
  const backdrop = h('div', { class: 'start-backdrop' }, dialog)

  function onKey(e: KeyboardEvent) {
    // While the menu is open it owns the keyboard: editor shortcuts mustn't act behind it.
    if (e.key === 'Escape' && o.canClose) close()
    if (e.key !== 'Tab') e.stopPropagation()
  }
  document.addEventListener('keydown', onKey, { capture: true, signal: o.signal })
  o.signal?.addEventListener('abort', () => {
    open = false
    backdrop.remove()
  })
  parent.append(backdrop)
  ;(dialog.querySelector<HTMLElement>('[data-action="resume"]') ?? cards.querySelector<HTMLElement>('.start__card'))?.focus()
  return backdrop
}
