// Colour picker (design brief B4): swatch row first, then hex field + native picker, then an
// optional factory reference (Pantone TCX or yarn code like MRS001, PRD §10.1).

import { ZONE_IDS } from '../model/schema'
import type { ColorRef, Mockup } from '../model/types'
import type { Store } from '../store/store'
import { h } from './dom'

const BASICS = ['#ffffff', '#000000', '#808080']
const MAX_SWATCHES = 16

/**
 * Swatches in brief order: the logo's colours, then the brand palette table, then colours
 * already used in this mockup, then white/black/grey.
 */
export function swatches(m: Mockup): string[] {
  const used = [
    ...ZONE_IDS.map((z) => m.zones[z].hex),
    ...m.zoneFills.flatMap((f) =>
      f.pattern.type === 'camo' ? f.pattern.colors.map((c) => c.hex) : f.pattern.type === 'argyle' ? [f.pattern.color.hex, f.pattern.line.hex] : [f.pattern.color.hex],
    ),
    ...m.placements.flatMap((p) => (p.content.type === 'text' ? [p.content.color.hex] : [])),
  ]
  const logo = m.header.logoAssetId ? (m.assets[m.header.logoAssetId]?.palette ?? []) : []
  const all = [...logo, ...m.header.palette.rows.map((r) => r.hex), ...used, ...BASICS].map((x) => x.toLowerCase())
  return [...new Set(all)].slice(0, MAX_SWATCHES)
}

export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#?/, '#').toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`
  return null
}

/**
 * A colour control. `onChange(color)` is called for every change; the store's gesture wraps
 * dragging in the native picker so a whole drag is one undo step.
 */
export function colorField(
  store: Store,
  label: string,
  value: ColorRef,
  onChange: (c: ColorRef) => void,
  opts: { factoryRef?: boolean } = {},
): HTMLElement {
  const row = h('div', { class: 'swatches', role: 'listbox', 'aria-label': `${label} swatches` })
  for (const hex of swatches(store.get())) {
    const b = h('button', {
      type: 'button',
      class: 'swatch',
      role: 'option',
      title: hex,
      'aria-label': hex,
      'aria-selected': String(hex === value.hex.toLowerCase()),
    })
    b.style.background = hex
    b.addEventListener('click', () => onChange({ ...value, hex }))
    row.append(b)
  }

  const hexInput = h('input', { class: 'input input--hex', type: 'text', value: value.hex, maxlength: '7', 'aria-label': `${label} hex`, spellcheck: 'false' })
  hexInput.addEventListener('change', () => {
    const hex = normalizeHex(hexInput.value)
    hexInput.classList.toggle('input--invalid', !hex)
    if (hex) onChange({ ...value, hex })
  })

  const picker = h('input', { class: 'color-native', type: 'color', value: value.hex, 'aria-label': `${label} picker` })
  // The native picker fires `input` continuously while dragging and `change` at the end.
  picker.addEventListener('input', () => {
    store.beginGesture()
    onChange({ ...value, hex: picker.value })
  })
  picker.addEventListener('change', () => store.endGesture())

  const parts: Node[] = [
    h('span', { class: 'field__label' }, label),
    row,
    h('div', { class: 'color-row' }, picker, hexInput),
  ]
  if (opts.factoryRef) {
    const ref = h('input', { class: 'input', type: 'text', value: value.ref ?? '', maxlength: '200', placeholder: 'Factory ref (e.g. Pantone 202C, MRS001)', 'aria-label': `${label} factory reference` })
    ref.addEventListener('change', () => {
      const v = ref.value.trim()
      const { ref: _old, ...rest } = value
      onChange(v ? { ...rest, ref: v } : rest)
    })
    parts.push(ref)
  }
  return h('div', { class: 'field' }, ...parts)
}
