import type { Mockup, ViewKind, ZoneId } from '../model/types'
import { flatView } from '../templates/flat'
import { PROFILE_EXTRAS } from '../templates/profile-extras'
import { PROFILE_SIZE, PROFILES, PROFILES_RIGHT } from '../templates/profiles.generated'
import { el } from './dom'
import { gripDots, motif, sameLook, zoneFill } from './patterns'
import { rightFromLeftTransform } from './placements'

// Left edge of each of the 4 view slots on the 1024x768 sheet, measured off Peter's slides.
// Flat tubes use sheet y directly; profiles sit in a box whose top is at y 290.
const SLOT_X = [36, 266, 470, 740] as const
const PROFILE_Y = 290
const OUTLINE = { stroke: '#000000', width: 1.5 }

function zonePath(d: string, zone: ZoneId, m: Mockup, transform = ''): SVGPathElement {
  // data-zone is how the editor knows which zone was clicked (and which to highlight in other views).
  return el('path', transform ? { d, transform, fill: zoneFill(m, zone), 'data-zone': zone } : { d, fill: zoneFill(m, zone), 'data-zone': zone })
}

type Shape = { d: string; transform?: string }

/** Zones Peter outlines in black (design brief A4). Stripes, bands and the foot have no line. */
const OUTLINED: ReadonlySet<ZoneId> = new Set(['cuff', 'heel', 'toe'])

// Cuff stripes on a side profile: bands that follow the cuff's edge (horizontal on crew, diagonal
// on the ankle tab). Drawn as thick strokes along the cuff outline under the cuff fill, so only
// the half outside the cuff shows: each stroke reaches `distance` units into the leg.
const STRIPE_GAP = 10
const STRIPE_H = 10
const SOLE_EDGE = 14 // visible width of the sole strip on the side profiles

const isProfile = (kind: ViewKind) => kind === 'left' || kind === 'right'

/** Where each view slot sits on the sheet. Placements use this as their local origin. */
export function slotOrigin(m: Mockup, index: number): { x: number; y: number } {
  return { x: SLOT_X[index], y: isProfile(m.views[index].kind) ? PROFILE_Y : 0 }
}

/**
 * Draw one view as a <g>. Paint order: base colour fills the outline; then foot (only if it
 * differs from the leg), cuff stripes, cuff, mid band, heel, toe; grip dots; zone lines. All of it
 * is clipped to the outline, so a zone that pokes past the edge never shows outside the sock.
 *
 * The group is translated to the slot but never flipped: a mirrored Right only flips the sock
 * drawing (and its clip), so logos and text placed on it still read the right way round.
 * Returns a clip id for placements: the same outline, but in the unflipped view space.
 */
export function renderView(
  m: Mockup,
  index: number,
): { g: SVGGElement; outline: SVGElement; placementClipId: string } {
  const kind = m.views[index].kind
  // A clip path is read in the coordinates of whatever uses it. The sock is drawn inside the
  // flip and placements outside it, so each gets its own copy of the outline.
  const clipId = `sock-clip-${index}`
  const placementClipId = `place-clip-${index}`
  let flip = ''
  let shapes: Shape[] // the sock's outline: one shape, plus the tab flap on ankle-tab profiles
  let base: ZoneId
  const zones: { zone: ZoneId; d: string; transform?: string }[] = []
  const stripeEdges: Shape[] = [] // cuff shapes the profile stripes run along
  const extraLines: Shape[] = []
  let soleEdge: { outline: string; region: Shape } | null = null
  const footDiffers = !sameLook(m, 'foot', 'leg')
  const soleDiffers = !sameLook(m, 'sole', 'leg')

  if (isProfile(kind)) {
    const id = m.template === 'crew' ? 'crew' : 'ankle'
    // Use a traced Right when Peter drew one (ankle); otherwise mirror the Left inside its slot.
    const traced = kind === 'right' ? PROFILES_RIGHT[id] : undefined
    const profile = traced ?? PROFILES[id]
    if (kind === 'right' && !traced) flip = `translate(${PROFILE_SIZE.width} 0) scale(-1 1)`
    // Extras are drawn in Left coordinates; on a traced Right they go through the fitted map.
    const ex = PROFILE_EXTRAS[m.template]
    const exT = traced ? (rightFromLeftTransform(m.template) ?? '') : ''
    const withT = (d: string): Shape => (exT ? { d, transform: exT } : { d })
    base = 'leg'
    // On Peter's traced Right, use his own Right flap where he drew one; else map the Left one.
    const flap = ex.flap ? (traced && ex.flapRight ? { d: ex.flapRight } : withT(ex.flap)) : null
    shapes = [{ d: profile.silhouette }, ...(flap ? [flap] : [])]
    if (footDiffers) zones.push({ zone: 'foot', ...withT(ex.foot) })
    if (soleDiffers) soleEdge = { outline: profile.silhouette, region: withT(ex.soleRegion) }
    stripeEdges.push({ d: profile.zones.cuff }, ...(flap ? [flap] : []))
    zones.push({ zone: 'cuff', d: profile.zones.cuff })
    if (flap) zones.push({ zone: 'cuff', ...flap })
    if (m.midBand) zones.push({ zone: 'band', ...withT(ex.band) })
    zones.push({ zone: 'heel', d: profile.zones.heel }, { zone: 'toe', d: profile.zones.toe })
  } else {
    const flat = flatView(kind, m.stripes, m.midBand, m.template)
    shapes = [{ d: flat.outline }]
    base = flat.base
    zones.push(...flat.zones.filter((z) => z.zone !== 'foot' || footDiffers))
    extraLines.push(...flat.lines.map((d) => ({ d })))
  }

  const o = slotOrigin(m, index)
  const g = el('g', { transform: `translate(${o.x} ${o.y})`, 'data-view': index })
  const clip = el('clipPath', { id: clipId })
  clip.append(...shapes.map((s) => el('path', s.transform ? { d: s.d, transform: s.transform } : { d: s.d })))
  const placeClip = el('clipPath', { id: placementClipId })
  placeClip.append(
    ...shapes.map((s) => {
      const t = [flip, s.transform].filter(Boolean).join(' ')
      return el('path', t ? { d: s.d, transform: t } : { d: s.d })
    }),
  )
  g.append(clip, placeClip)
  const soleClipId = `sole-clip-${index}`
  if (soleEdge) {
    const sc = el('clipPath', { id: soleClipId })
    sc.append(el('path', soleEdge.region.transform ? { d: soleEdge.region.d, transform: soleEdge.region.transform } : { d: soleEdge.region.d }))
    g.append(sc)
  }

  const line = (s: Shape) =>
    el('path', {
      d: s.d,
      ...(s.transform ? { transform: s.transform } : {}),
      fill: 'none',
      stroke: OUTLINE.stroke,
      'stroke-width': OUTLINE.width,
      'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
      'pointer-events': 'none',
    })

  const sock = el('g', flip ? { transform: flip, 'data-part': 'sock' } : { 'data-part': 'sock' })
  const painted = el('g', { 'clip-path': `url(#${clipId})` })
  painted.append(...shapes.slice(0, 1).map((s) => zonePath(s.d, base, m)))

  // Paint order: foot, sole edge, motif, profile stripes, then cuff/band/heel/toe over all of them.
  const foot = zones.filter((z) => z.zone === 'foot')
  painted.append(...foot.map((z) => zonePath(z.d, z.zone, m, z.transform)))
  // Sole edge: the outline stroked thick (only the inside half shows), kept to the sole side.
  if (soleEdge) {
    painted.append(
      el('path', {
        d: soleEdge.outline,
        fill: 'none',
        stroke: m.zones.sole.hex, // flat colour, see the profile stripes above
        'stroke-width': SOLE_EDGE * 2,
        'clip-path': `url(#${soleClipId})`,
        'data-zone': 'sole',
        'data-stroke': '',
      }),
    )
  }
  // The repeat motif: on the leg and foot only (stripes, cuff, band, heel and toe paint over it).
  const scattered = motif(m, index, Boolean(flip))
  if (scattered) painted.append(scattered)

  // Profile cuff stripes, widest first, each stroke reaching its distance into the leg. A
  // leg-coloured stroke between them makes the gaps. The cuff fill (next) covers the inner halves.
  if (stripeEdges.length && m.stripes > 0) {
    const s1 = STRIPE_GAP + STRIPE_H
    const steps: [ZoneId, number][] =
      m.stripes === 2
        ? [['stripe2', s1 + STRIPE_GAP + STRIPE_H], ['leg', s1 + STRIPE_GAP], ['stripe1', s1], ['leg', STRIPE_GAP]]
        : [['stripe1', s1], ['leg', STRIPE_GAP]]
    for (const [zone, distance] of steps) {
      for (const e of stripeEdges) {
        painted.append(
          el('path', {
            d: e.d,
            ...(e.transform ? { transform: e.transform } : {}),
            fill: 'none',
            // Flat colour, never a pattern: svg2pdf can't stroke with a pattern, and the PDF
            // must match the screen. These bands are too narrow for a pattern to read anyway.
            stroke: m.zones[zone].hex,
            'stroke-width': distance * 2,
            'stroke-linejoin': 'round',
            'data-zone': zone,
            // Stroke-drawn: the editor's hover/selection outline must not repaint these.
            'data-stroke': '',
          }),
        )
      }
    }
  }

  painted.append(...zones.filter((z) => z.zone !== 'foot').map((z) => zonePath(z.d, z.zone, m, z.transform)))
  // Grip dots go over the zone colours but under the zone lines (Peter's REWD heel).
  const dots = isProfile(kind) ? null : gripDots(m, index)
  if (dots) painted.append(dots)
  painted.append(...zones.filter((z) => OUTLINED.has(z.zone)).map((z) => line(z)), ...extraLines.map(line))
  sock.append(painted)
  g.append(sock)
  // The outer outline is returned separately so the sheet can draw it above clipped logos.
  const top = el('g', flip ? { transform: flip } : {})
  top.append(...shapes.map(line))
  return { g, outline: top, placementClipId }
}
