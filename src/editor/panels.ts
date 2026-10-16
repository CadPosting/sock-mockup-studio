// Inspector panels for a selection: a zone (colour + pattern), grip dots, the repeat motif.
// These are rebuilt from state whenever it changes (unless the user is mid-edit in one of them),
// which keeps them simple: no per-control syncing.

import { PATTERN_TYPES } from '../model/schema'
import type { ColorRef, GripDots, Motif, ZoneId, ZonePattern } from '../model/types'
import type { Store } from '../store/store'
import { colorField } from './color-field'
import { h } from './dom'
import { ZONE_NAMES } from './layers'
import type { SelectionStore } from './selection'

const PATTERN_NAMES: Record<(typeof PATTERN_TYPES)[number], string> = {
  stripes: 'Stripes',
  checks: 'Checks',
  dots: 'Dots',
  chevrons: 'Chevrons',
  camo: 'Camo',
  argyle: 'Argyle',
}

/** Slider + number side by side (B4). Dragging the slider is one undo step. */
function numberField(store: Store, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) {
  const range = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label })
  const num = h('input', { class: 'input input--num', type: 'number', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': `${label} value` })
  range.addEventListener('pointerdown', () => store.beginGesture())
  range.addEventListener('input', () => {
    num.value = range.value
    onChange(Number(range.value))
  })
  range.addEventListener('change', () => store.endGesture())
  num.addEventListener('change', () => {
    const v = Math.min(max, Math.max(min, Number(num.value)))
    if (Number.isFinite(v)) onChange(v)
  })
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('div', { class: 'num-row' }, range, num))
}

function segmented<T extends string | number>(label: string, options: [T, string][], value: T, onChange: (v: T) => void) {
  const g = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label })
  for (const [v, text] of options) {
    const b = h('button', { type: 'button', class: 'segmented__btn', role: 'radio', 'aria-checked': String(v === value) }, text)
    b.addEventListener('click', () => onChange(v))
    g.append(b)
  }
  return h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), g)
}

/** Starting values for a newly chosen pattern, picked to read well on a sock at sheet size. */
function defaultPattern(type: ZonePattern['type'], base: string): ZonePattern {
  const contrast: ColorRef = { hex: base.toLowerCase() === '#000000' ? '#ffffff' : '#000000' }
  switch (type) {
    case 'stripes':
      return { type, color: contrast, width: 6, gap: 6, angle: 0 }
    case 'checks':
      return { type, color: contrast, size: 10 }
    case 'dots':
      return { type, color: contrast, size: 5, spacing: 14, style: 'solid' }
    case 'chevrons':
      return { type, color: contrast, size: 16 }
    case 'camo':
      return { type, colors: [{ hex: '#3f5a3c' }, { hex: '#7a6a4f' }, { hex: '#1f2a1d' }], size: 70 }
    case 'argyle':
      return { type, color: contrast, line: { hex: '#808080' }, size: 40 }
  }
}

function patternControls(store: Store, zone: ZoneId, p: ZonePattern): Node[] {
  const set = (next: ZonePattern) => store.dispatch({ type: 'setZonePattern', zone, pattern: next })
  const num = (label: string, key: string, min: number, max: number, step = 1) =>
    numberField(store, label, (p as unknown as Record<string, number>)[key], min, max, step, (v) => set({ ...p, [key]: v } as ZonePattern))
  switch (p.type) {
    case 'stripes':
      return [colorField(store, 'Stripe colour', p.color, (c) => set({ ...p, color: c })), num('Stripe width', 'width', 2, 80), num('Gap', 'gap', 2, 80), num('Angle', 'angle', -90, 90, 5)]
    case 'checks':
      return [colorField(store, 'Check colour', p.color, (c) => set({ ...p, color: c })), num('Square size', 'size', 4, 80)]
    case 'dots':
      return [
        colorField(store, 'Dot colour', p.color, (c) => set({ ...p, color: c })),
        segmented('Dot style', [['solid', 'Solid'], ['outline', 'Outline']], p.style, (style) => set({ ...p, style })),
        num('Dot size', 'size', 1, 30),
        num('Spacing', 'spacing', 4, 60),
      ]
    case 'chevrons':
      return [colorField(store, 'Chevron colour', p.color, (c) => set({ ...p, color: c })), num('Size', 'size', 6, 80)]
    case 'camo':
      return [
        ...p.colors.map((c, i) => colorField(store, `Camo colour ${i + 1}`, c, (nc) => set({ ...p, colors: p.colors.map((x, j) => (j === i ? nc : x)) }))),
        num('Blob size', 'size', 20, 200, 5),
      ]
    case 'argyle':
      return [
        colorField(store, 'Diamond colour', p.color, (c) => set({ ...p, color: c })),
        colorField(store, 'Line colour', p.line, (c) => set({ ...p, line: c })),
        num('Diamond size', 'size', 10, 150),
      ]
  }
}

export function zonePanel(store: Store, zone: ZoneId): HTMLElement {
  const m = store.get()
  const color = m.zones[zone]
  const pattern = m.zoneFills.find((f) => f.zone === zone)?.pattern ?? null

  const patternSelect = h(
    'select',
    { class: 'input', 'aria-label': 'Pattern' },
    h('option', { value: '' }, 'None (flat colour)'),
    ...PATTERN_TYPES.map((t) => h('option', { value: t, selected: pattern?.type === t }, PATTERN_NAMES[t])),
  )
  patternSelect.addEventListener('change', () => {
    const t = patternSelect.value as ZonePattern['type'] | ''
    store.dispatch({ type: 'setZonePattern', zone, pattern: t ? defaultPattern(t, color.hex) : null })
  })

  return h(
    'div',
    { class: 'panel-section' },
    h('h2', { class: 'inspector__title' }, ZONE_NAMES[zone]),
    h('p', { class: 'hint hint--quiet' }, 'Changes this part on every view.'),
    colorField(store, pattern ? 'Base colour' : 'Colour', color, (c) => store.dispatch({ type: 'setZoneColor', zone, color: c }), { factoryRef: true }),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Pattern'), patternSelect),
    ...(pattern ? patternControls(store, zone, pattern) : []),
  )
}

export const DEFAULT_GRIP: GripDots = { style: 'solid', color: { hex: '#000000' }, spacing: 18, size: 4, onBack: false }
export const DEFAULT_MOTIF: Motif = { content: { type: 'text', text: 'X', font: 'arimo', color: { hex: '#000000' } }, views: [0, 1, 2, 3], size: 30, spacing: 80 }

export function gripPanel(store: Store, selection: SelectionStore): HTMLElement {
  const g = store.get().patterns.gripDots
  if (!g) return h('div')
  const set = (patch: Partial<GripDots>) => store.dispatch({ type: 'setGripDots', gripDots: { ...g, ...patch } })
  const remove = h('button', { type: 'button', class: 'btn btn--danger' }, 'Remove grip dots')
  remove.addEventListener('click', () => {
    store.dispatch({ type: 'setGripDots', gripDots: null })
    selection.set(null)
  })
  return h(
    'div',
    { class: 'panel-section' },
    h('h2', { class: 'inspector__title' }, 'Grip dots'),
    colorField(store, 'Dot colour', g.color, (color) => set({ color }), { factoryRef: true }),
    segmented('Dot style', [['solid', 'Solid'], ['outline', 'Outline']], g.style, (style) => set({ style })),
    numberField(store, 'Dot size', g.size, 1, 30, 1, (size) => set({ size })),
    numberField(store, 'Spacing', g.spacing, 4, 60, 1, (spacing) => set({ spacing })),
    segmented('Where', [[0, 'Sole only'], [1, 'Sole + lower back']], g.onBack ? 1 : 0, (v) => set({ onBack: v === 1 })),
    remove,
  )
}

export function motifPanel(store: Store, selection: SelectionStore): HTMLElement {
  const m = store.get()
  const mo = m.patterns.motif
  if (!mo) return h('div')
  const set = (patch: Partial<Motif>) => store.dispatch({ type: 'setMotif', motif: { ...mo, ...patch } })
  const parts: Node[] = [h('h2', { class: 'inspector__title' }, 'Repeat motif')]

  if (mo.content.type === 'text') {
    const content = mo.content
    const text = h('input', { class: 'input', type: 'text', value: content.text, maxlength: '20', 'aria-label': 'Motif text' })
    text.addEventListener('change', () => set({ content: { ...content, text: text.value } }))
    parts.push(
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Letter or word'), text),
      segmented('Font', [['arimo', 'Arimo Bold'], ['oswald', 'Oswald'], ['baskerville', 'Baskerville']], content.font, (font) => set({ content: { ...content, font } })),
      colorField(store, 'Colour', content.color, (color) => set({ content: { ...content, color } }), { factoryRef: true }),
    )
  }

  // Which views get the motif.
  const views = h('div', { class: 'checks' })
  m.views.forEach((v, i) => {
    const box = h('input', { type: 'checkbox', checked: mo.views.includes(i) })
    box.addEventListener('change', () => set({ views: box.checked ? [...mo.views, i].sort() : mo.views.filter((x) => x !== i) }))
    views.append(h('label', { class: 'check' }, box, v.label || v.kind))
  })
  const remove = h('button', { type: 'button', class: 'btn btn--danger' }, 'Remove motif')
  remove.addEventListener('click', () => {
    store.dispatch({ type: 'setMotif', motif: null })
    selection.set(null)
  })
  parts.push(
    numberField(store, 'Size', mo.size, 5, 200, 1, (size) => set({ size })),
    numberField(store, 'Spacing', mo.spacing, 10, 300, 5, (spacing) => set({ spacing })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'On views'), views),
    remove,
  )
  return h('div', { class: 'panel-section' }, ...parts)
}

/** A selected logo or text wordmark (PRD 5.6). */
export function placementPanel(store: Store, selection: SelectionStore, id: string): HTMLElement {
  const m = store.get()
  const p = m.placements.find((q) => q.id === id)
  if (!p) return h('div')
  const set = (patch: Parameters<typeof updatePatch>[0]) => store.dispatch(updatePatch(patch, id))
  const parts: Node[] = []

  if (p.content.type === 'text') {
    const content = p.content
    parts.push(h('h2', { class: 'inspector__title' }, 'Text'))
    const text = h('input', { class: 'input', type: 'text', value: content.text, maxlength: '200', 'aria-label': 'Text' })
    // Typing is one undo step, like the client name.
    text.addEventListener('focus', () => store.beginGesture())
    text.addEventListener('input', () => set({ content: { ...content, text: text.value } }))
    text.addEventListener('blur', () => store.endGesture())
    parts.push(
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Text'), text),
      segmented('Font', [['arimo', 'Arimo Bold'], ['oswald', 'Oswald'], ['baskerville', 'Baskerville']], content.font, (font) => set({ content: { ...content, font } })),
      colorField(store, 'Colour', content.color, (color) => set({ content: { ...content, color } }), { factoryRef: true }),
    )
  } else {
    const asset = m.assets[p.content.assetId]
    parts.push(h('h2', { class: 'inspector__title' }, 'Logo'), h('p', { class: 'hint hint--quiet' }, asset?.name ?? ''))
  }

  parts.push(
    numberField(store, 'Size', Math.round(p.scale * 100), 5, 600, 1, (v) => set({ scale: v / 100 })),
    numberField(store, 'Rotation', Math.round(p.rotation), -180, 180, 1, (rotation) => set({ rotation })),
    segmented('Clip to sock outline', [[1, 'On'], [0, 'Off']], p.clip ? 1 : 0, (v) => set({ clip: v === 1 })),
  )

  const linked = m.placements.find((q) => q.id !== p.id && (q.mirrorOf === p.id || p.mirrorOf === q.id))
  if (linked) {
    const unlink = h('button', { type: 'button', class: 'btn btn--outline' }, 'Unlink')
    unlink.addEventListener('click', () => store.dispatch({ type: 'unlinkPlacement', id }))
    const other = m.views[linked.view].label || m.views[linked.view].kind
    parts.push(h('div', { class: 'field linked' }, h('span', {}, `Mirrored on ${other}. Moving either moves both.`), unlink))
  }

  const remove = h('button', { type: 'button', class: 'btn btn--danger' }, linked ? 'Delete (both sides)' : 'Delete')
  remove.addEventListener('click', () => {
    store.dispatch({ type: 'removePlacement', id })
    selection.set(null)
  })
  parts.push(remove)
  return h('div', { class: 'panel-section' }, ...parts)
}

type PlacementPatch = Partial<Omit<import('../model/types').Placement, 'id' | 'mirrorOf'>>
function updatePatch(patch: PlacementPatch, id: string) {
  return { type: 'updatePlacement' as const, id, patch }
}
