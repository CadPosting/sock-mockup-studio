// Pattern fills for zones, grip dots, and the repeat motif (PRD 5.7).
// Every repeating fill is one SVG <pattern> tile, not hundreds of shapes, so re-rendering stays
// inside one frame while dragging (TDD §9).

import type { Mockup, ZoneId, ZonePattern } from '../model/types'
import { BOTTOM, CAP_RY, FLAT_WIDTH, HEEL_Y, SOLE_TOP } from '../templates/flat'
import { PROFILE_SIZE } from '../templates/profiles.generated'
import { el } from './dom'
import { BASE, content } from './placements'

export const fillId = (zone: ZoneId) => `fill-${zone}`

// Camo blobs in a 100x100 tile, kept away from the edges so tiles join without hard seams.
const CAMO_BLOBS = [
  'M12 20Q25 6 40 16T52 38Q40 52 24 46T12 20Z',
  'M60 8Q78 4 86 20T76 44Q62 46 56 30T60 8Z',
  'M30 60Q46 52 58 64T50 88Q34 94 26 80T30 60Z',
  'M70 58Q88 56 92 72T80 92Q66 90 64 76T70 58Z',
  'M6 66Q14 58 20 68T12 84Q4 80 6 66Z',
]

/** The tile for one zone pattern. The zone colour fills the tile; the pattern colours go on top. */
function tile(zoneHex: string, p: ZonePattern, id: string): SVGPatternElement {
  const pat = (w: number, h: number, extra: Record<string, string | number> = {}) => {
    const node = el('pattern', { id, patternUnits: 'userSpaceOnUse', width: w, height: h, ...extra })
    node.append(el('rect', { width: w, height: h, fill: zoneHex }))
    return node
  }
  switch (p.type) {
    case 'stripes': {
      const node = pat(10, p.width + p.gap, { patternTransform: `rotate(${p.angle})` })
      node.append(el('rect', { width: 10, height: p.width, fill: p.color.hex }))
      return node
    }
    case 'checks': {
      const s = p.size
      const node = pat(s * 2, s * 2)
      node.append(
        el('rect', { width: s, height: s, fill: p.color.hex }),
        el('rect', { x: s, y: s, width: s, height: s, fill: p.color.hex }),
      )
      return node
    }
    case 'dots': {
      // Offset every other row, like Peter's grip dots (design brief A4).
      const sp = p.spacing
      const node = pat(sp, sp * 2)
      const dot = (cx: number, cy: number) =>
        el('circle', {
          cx,
          cy,
          r: p.size / 2,
          ...(p.style === 'solid' ? { fill: p.color.hex } : { fill: 'none', stroke: p.color.hex, 'stroke-width': 1 }),
        })
      node.append(dot(sp / 2, sp / 2), dot(0, sp * 1.5), dot(sp, sp * 1.5))
      return node
    }
    case 'chevrons': {
      const s = p.size
      const node = pat(s, s / 2)
      node.append(
        el('path', {
          d: `M0 ${s / 2}L${s / 2} 0L${s} ${s / 2}`,
          fill: 'none',
          stroke: p.color.hex,
          'stroke-width': s / 5,
          'stroke-linejoin': 'miter',
        }),
      )
      return node
    }
    case 'camo': {
      const k = p.size / 100
      const node = pat(p.size, p.size)
      const g = el('g', { transform: `scale(${k})` })
      CAMO_BLOBS.forEach((d, i) => g.append(el('path', { d, fill: p.colors[i % p.colors.length].hex })))
      node.append(g)
      return node
    }
    case 'argyle': {
      // A diamond on the zone colour makes the classic two-colour diamond check. The thin
      // overcheck lines run corner to corner, through the centre of every diamond.
      const w = p.size
      const h = p.size * 1.4
      const node = pat(w, h)
      const line = { stroke: p.line.hex, 'stroke-width': Math.max(0.8, w / 50), fill: 'none' }
      node.append(
        el('path', { d: `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`, fill: p.color.hex }),
        el('path', { d: `M0 0L${w} ${h}`, ...line }),
        el('path', { d: `M${w} 0L0 ${h}`, ...line }),
      )
      return node
    }
  }
}

/** <defs> holding one <pattern> per patterned zone, plus the grip-dot tile. Shared by all views. */
export function patternDefs(m: Mockup): SVGDefsElement {
  const defs = el('defs')
  for (const f of m.zoneFills) defs.append(tile(m.zones[f.zone].hex, f.pattern, fillId(f.zone)))
  const grip = m.patterns.gripDots
  if (grip) {
    // Transparent base: grip dots sit on top of whatever the sole is coloured or patterned with.
    const sp = grip.spacing
    const node = el('pattern', { id: 'grip-dots', patternUnits: 'userSpaceOnUse', width: sp, height: sp * 2 })
    const dot = (cx: number, cy: number) =>
      el('circle', {
        cx,
        cy,
        r: grip.size / 2,
        ...(grip.style === 'solid'
          ? { fill: grip.color.hex }
          : { fill: 'none', stroke: grip.color.hex, 'stroke-width': 0.8 }),
      })
    node.append(dot(sp / 2, sp / 2), dot(0, sp * 1.5), dot(sp, sp * 1.5))
    defs.append(node)
  }
  return defs
}

/** True when two zones look identical (same colour, factory ref and pattern). */
export function sameLook(m: Mockup, a: ZoneId, b: ZoneId): boolean {
  const fill = (z: ZoneId) => JSON.stringify(m.zoneFills.find((f) => f.zone === z)?.pattern ?? null)
  return JSON.stringify(m.zones[a]) === JSON.stringify(m.zones[b]) && fill(a) === fill(b)
}

/** What a zone path's fill should be: its pattern if it has one, else its flat colour. */
export function zoneFill(m: Mockup, zone: ZoneId): string {
  return m.zoneFills.some((f) => f.zone === zone) ? `url(#${fillId(zone)})` : m.zones[zone].hex
}

/**
 * Grip dots for a flat view: the whole sole (Impact, Nutrio), or the back below the heel when
 * `onBack` is set (REWD, PYC). Returns null for views that don't get dots.
 */
export function gripDots(m: Mockup, index: number): SVGElement | null {
  const grip = m.patterns.gripDots
  const kind = m.views[index].kind
  if (!grip) return null
  const top = kind === 'sole' ? SOLE_TOP - CAP_RY : kind === 'back' && grip.onBack ? HEEL_Y[m.template] : null
  if (top === null) return null
  return el('rect', {
    x: 0,
    y: top,
    width: FLAT_WIDTH,
    height: BOTTOM + CAP_RY - top,
    fill: 'url(#grip-dots)',
    'data-part': 'grip-dots',
    'pointer-events': 'none', // clicks go through to the zone underneath
  })
}

/**
 * Repeat motif (StFX "X"): the logo or letter scattered on a grid with every other row offset,
 * on the chosen views. Drawn inside the sock, under the cuff, band, heel and toe, so like Peter's
 * StFX sheet it only shows on the leg and foot. `flipped`: the view is the mirrored crew Right,
 * so each copy is flipped back and still reads the right way round.
 */
export function motif(m: Mockup, index: number, flipped = false): SVGGElement | null {
  const mo = m.patterns.motif
  if (!mo || !mo.views.includes(index)) return null
  const profile = m.views[index].kind === 'left' || m.views[index].kind === 'right'
  const box = profile ? { w: PROFILE_SIZE.width, y0: 0, y1: PROFILE_SIZE.height } : { w: FLAT_WIDTH, y0: SOLE_TOP, y1: BOTTOM + CAP_RY }
  const scale = mo.size / (mo.content.type === 'image' ? BASE.image : BASE.text)
  const g = el('g', { 'data-part': 'motif', 'pointer-events': 'none' })
  let row = 0
  for (let y = box.y0 + mo.spacing / 2; y < box.y1; y += mo.spacing, row++) {
    for (let x = (row % 2 ? mo.spacing : mo.spacing / 2) - mo.spacing / 2; x <= box.w; x += mo.spacing) {
      const node = content(m, { id: 'motif', view: index, content: mo.content, x, y, scale, rotation: 0, clip: true })
      if (!node) return null
      node.removeAttribute('data-field') // motif copies aren't edited one by one
      const item = el('g', { transform: flipped ? `translate(${x} ${y}) scale(-1 1)` : `translate(${x} ${y})` })
      item.append(node)
      g.append(item)
    }
  }
  return g
}
