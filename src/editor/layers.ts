// Layers panel (design brief B2): what's on the sheet, grouped as Zones, Logos, Text, Patterns.
// Rows become clickable selections in task 10; for now the panel is a live outline.

import { ZONE_IDS } from '../model/schema'
import type { Mockup, ZoneId } from '../model/types'
import { h } from './dom'

const ZONE_NAMES: Record<ZoneId, string> = {
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

function row(label: string, swatch?: string, note?: string) {
  const sw = h('span', { class: 'layers__swatch' })
  if (swatch) sw.style.background = swatch
  return h(
    'li',
    { class: 'layers__row' },
    swatch ? sw : null,
    h('span', { class: 'layers__label' }, label),
    note ? h('span', { class: 'layers__note' }, note) : null,
  )
}

export function renderLayers(m: Mockup): HTMLElement {
  const patterned = new Map(m.zoneFills.map((f) => [f.zone, f.pattern.type]))
  const zones = visibleZones(m).map((z) => row(ZONE_NAMES[z], m.zones[z].hex, patterned.get(z)))

  const viewName = (i: number) => m.views[i].label || m.views[i].kind
  const logos = m.placements
    .filter((p) => p.content.type === 'image')
    .map((p) => row(m.assets[(p.content as { assetId: string }).assetId]?.name ?? 'Logo', undefined, viewName(p.view)))
  const texts = m.placements
    .filter((p) => p.content.type === 'text')
    .map((p) => row((p.content as { text: string }).text || 'Text', undefined, viewName(p.view)))

  const patterns = [
    m.patterns.gripDots ? row('Grip dots', m.patterns.gripDots.color.hex) : null,
    m.patterns.motif ? row('Repeat motif') : null,
  ].filter((n): n is HTMLLIElement => n !== null)

  return h(
    'div',
    { class: 'layers' },
    section('Zones', zones, ''),
    section('Logos', logos, 'No logos yet'),
    section('Text', texts, 'No text yet'),
    section('Patterns', patterns, 'None'),
  )
}
