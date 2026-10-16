// Edit text in place on the sheet (PRD 5.13, engineering-plan task 13b). An HTML <input> is laid
// over the clicked text, sized to match it. It's editor-only DOM on top of the sheet, so it can
// never end up in an export. Typing updates the sheet live; the whole edit is one undo step;
// Esc puts everything back exactly as it was.

import type { Mockup } from '../model/types'
import type { Store } from '../store/store'
import { h } from './dom'

type Field =
  | { kind: 'title' }
  | { kind: 'tagN' }
  | { kind: 'tagLine'; line: 'line1' | 'line2' }
  | { kind: 'spec'; id: string }
  | { kind: 'specLabel'; id: string }
  | { kind: 'pal'; index: number; key: 'name' | 'cmyk' }
  | { kind: 'label'; index: number }
  | { kind: 'placement'; id: string }

export function parseField(key: string): Field | null {
  if (key === 'title') return { kind: 'title' }
  if (key === 'tag:n') return { kind: 'tagN' }
  if (key === 'tag:line1' || key === 'tag:line2') return { kind: 'tagLine', line: key.slice(4) as 'line1' | 'line2' }
  if (key.startsWith('spec:')) return { kind: 'spec', id: key.slice(5) }
  if (key.startsWith('spec-label:')) return { kind: 'specLabel', id: key.slice(11) }
  if (key.startsWith('pal-name:')) return { kind: 'pal', index: Number(key.slice(9)), key: 'name' }
  if (key.startsWith('pal-cmyk:')) return { kind: 'pal', index: Number(key.slice(9)), key: 'cmyk' }
  if (key.startsWith('label:')) return { kind: 'label', index: Number(key.slice(6)) }
  if (key.startsWith('placement:')) return { kind: 'placement', id: key.slice(10) }
  return null
}

/** The current text of a field, or null if it no longer exists (or isn't text). */
export function readField(m: Mockup, f: Field): string | null {
  switch (f.kind) {
    case 'title':
      return m.header.title
    case 'tagN':
      return m.header.tag.mode === 'sample' ? String(m.header.tag.n) : null
    case 'tagLine':
      return m.header.tag.mode === 'code' ? m.header.tag[f.line] : null
    case 'spec':
      return m.header.specs.find((r) => r.id === f.id)?.value ?? null
    case 'specLabel':
      return m.header.specs.find((r) => r.id === f.id)?.label ?? null
    case 'pal':
      return m.header.palette.rows[f.index]?.[f.key] ?? null
    case 'label':
      return m.views[f.index]?.label ?? null
    case 'placement': {
      const p = m.placements.find((q) => q.id === f.id)
      return p?.content.type === 'text' ? p.content.text : null
    }
  }
}

function writeField(store: Store, f: Field, value: string) {
  const m = store.get()
  switch (f.kind) {
    case 'title':
      return store.dispatch({ type: 'setHeader', patch: { title: value } })
    case 'tagN': {
      const n = Math.round(Number(value.replace(/\D/g, '')))
      if (n >= 1 && n <= 999) store.dispatch({ type: 'setHeader', patch: { tag: { mode: 'sample', n } } })
      return
    }
    case 'tagLine':
      if (m.header.tag.mode === 'code') store.dispatch({ type: 'setHeader', patch: { tag: { ...m.header.tag, [f.line]: value } } })
      return
    case 'spec':
      return store.dispatch({ type: 'updateSpec', id: f.id, patch: { value } })
    case 'specLabel':
      return store.dispatch({ type: 'updateSpec', id: f.id, patch: { label: value } })
    case 'pal': {
      const pal = m.header.palette
      const rows = pal.rows.map((r, i) => (i === f.index ? { ...r, [f.key]: value } : r))
      return store.dispatch({ type: 'setHeader', patch: { palette: { ...pal, rows } } })
    }
    case 'label':
      return store.dispatch({ type: 'setViewLabel', index: f.index, label: value })
    case 'placement': {
      const p = m.placements.find((q) => q.id === f.id)
      if (p?.content.type === 'text') store.dispatch({ type: 'updatePlacement', id: f.id, patch: { content: { ...p.content, text: value } } })
    }
  }
}

const MAX_LEN = { title: 200, tagN: 3, tagLine: 200, spec: 500, specLabel: 200, pal: 200, label: 200, placement: 200 } as const

/**
 * Open an editor over `target` (a rendered element with data-field) inside `sheet`.
 * Returns false if the field can't be edited (e.g. it was just removed).
 */
export function startInlineEdit(store: Store, sheet: HTMLElement, target: Element, onDone: () => void = () => {}): boolean {
  const key = target.getAttribute('data-field')
  const field = key ? parseField(key) : null
  if (!field) return false
  const original = readField(store.get(), field)
  if (original === null) return false

  // Size and place the input over the text, in the sheet's on-screen scale.
  const sheetRect = sheet.getBoundingClientRect()
  const r = target.getBoundingClientRect()
  const scale = sheetRect.width / 1024 || 1
  const fontSize = Number(target.getAttribute('font-size') ?? target.closest('[font-size]')?.getAttribute('font-size') ?? 16) * scale
  const input = h('input', {
    class: 'inline-edit',
    type: field.kind === 'tagN' ? 'number' : 'text',
    value: original,
    maxlength: String(MAX_LEN[field.kind]),
    'aria-label': 'Edit text',
    spellcheck: 'true',
  })
  Object.assign(input.style, {
    left: `${r.left - sheetRect.left - 4}px`,
    top: `${r.top - sheetRect.top + r.height / 2 - fontSize * 0.75}px`,
    minWidth: `${Math.max(60, r.width + 24)}px`,
    height: `${fontSize * 1.5}px`,
    fontSize: `${fontSize}px`,
    fontWeight: target.getAttribute('font-weight') ?? target.closest('[font-weight]')?.getAttribute('font-weight') ?? '400',
  })
  sheet.append(input)

  store.beginGesture()
  let finished = false
  const finish = (keep: boolean) => {
    if (finished) return
    finished = true
    if (keep) store.endGesture()
    else store.cancelGesture()
    input.remove()
    onDone()
  }
  // Grow with the text, so the box always covers the live text it's editing.
  const minWidth = Math.max(60, r.width + 24)
  const grow = () => {
    input.style.width = '0px'
    input.style.width = `${Math.max(minWidth, input.scrollWidth + 12)}px`
  }
  input.addEventListener('input', () => {
    writeField(store, field, input.value)
    grow()
  })
  input.addEventListener('keydown', (e) => {
    // Arrows/Delete inside the box edit text, not the selected logo. App shortcuts like Ctrl+E
    // (export) still go through: typing has already updated the store.
    const appShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e'
    if (!appShortcut) e.stopPropagation()
    if (e.key === 'Enter') finish(true)
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
  grow()
  input.focus()
  input.select()
  return true
}
