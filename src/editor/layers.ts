// Layers panel (design brief B2): what's on the sheet, grouped as Zones, Logos, Text, Patterns.
// Clicking a row selects that thing, the same as clicking it on the sheet.

import { ZONE_IDS } from '../model/schema'
import type { Mockup, ZoneId } from '../model/types'
import { h } from './dom'

export const ZONE_NAMES: Record<ZoneId, string> = {
  cuff: 'Cuff',
  stripe1: 'Cuff stripe 1',
  stripe2: 'Cuff stripe 2',
  leg: 'Leg',
  band: 'Mid band',
  heel: 'Heel',
  foot: 'Foot',
  toe: 'Toe',
  sole: 'Sole',
}

/** Zones that are actually drawn with the current settings (no point listing hidden stripes). */
function visibleZones(m: Mockup): ZoneId[] {
  const hasSole = m.views.some((v) => v.kind === 'sole')
  return ZONE_IDS.filter((z) => {
    if (z === 'stripe1') return m.stripes >= 1
    if (z === 'stripe2') return m.stripes >= 2
    if (z === 'band') return m.midBand
    if (z === 'sole') return hasSole
    return z !== 'foot' // not drawn by any template yet
  })
}

function section(title: string, rows: Node[], empty: string) {
  return h(
    'section',
    { class: 'layers__section' },
    h('h2', { class: 'layers__title' }, title),
    rows.length ? h('ul', { class: 'layers__list' }, ...rows) : h('p', { class: 'layers__empty' }, empty),
  )
}

function row(label: string, swatch?: string, note?: string, select?: string) {
  const sw = h('span', { class: 'layers__swatch' })
  if (swatch) sw.style.background = swatch
  return h(
    'li',
    { class: select ? 'layers__row layers__row--button' : 'layers__row', 'data-select': select, tabindex: select ? '0' : undefined },
    swatch ? sw : null,
    h('span', { class: 'layers__label' }, label),
    note ? h('span', { class: 'layers__note' }, note) : null,
  )
}

export function renderLayers(m: Mockup, selected: string | null): HTMLElement {
  const patterned = new Map(m.zoneFills.map((f) => [f.zone, f.pattern.type]))
  const zones = visibleZones(m).map((z) => row(ZONE_NAMES[z], m.zones[z].hex, patterned.get(z), `zone:${z}`))

  const viewName = (i: number) => m.views[i].label || m.views[i].kind
  const logos = m.placements
    .filter((p) => p.content.type === 'image')
    .map((p) => row(m.assets[(p.content as { assetId: string }).assetId]?.name ?? 'Logo', undefined, viewName(p.view), `placement:${p.id}`))
  const texts = m.placements
    .filter((p) => p.content.type === 'text')
    .map((p) => row((p.content as { text: string }).text || 'Text', (p.content as { color: { hex: string } }).color.hex, viewName(p.view), `placement:${p.id}`))

  const patterns = [
    m.patterns.gripDots ? row('Grip dots', m.patterns.gripDots.color.hex, undefined, 'gripDots') : null,
    m.patterns.motif ? row('Repeat motif', undefined, undefined, 'motif') : null,
  ].filter((n): n is HTMLLIElement => n !== null)

  const header = row('Header & specs', undefined, undefined, 'header')
  for (const r of [header, ...zones, ...logos, ...texts, ...patterns]) if (r.dataset.select === selected) r.classList.add('layers__row--selected')
  return h(
    'div',
    { class: 'layers' },
    h('section', { class: 'layers__section' }, h('ul', { class: 'layers__list' }, header)),
    section('Zones', zones, ''),
    section('Logos', logos, 'No logos yet'),
    section('Text', texts, 'No text yet'),
    section('Patterns', patterns, 'None'),
  )
}
