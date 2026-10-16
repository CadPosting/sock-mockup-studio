import type { Mockup, ViewKind, ZoneId } from '../model/types'
import { flatView, HEEL_Y } from '../templates/flat'
import { el } from './dom'
import { gripDots, zoneFill } from './patterns'
import { PROFILE_SIZE, PROFILES, PROFILES_RIGHT } from '../templates/profiles.generated'


// Left edge of each of the 4 view slots on the 1024x768 sheet, measured off Peter's slides.
// Flat tubes use sheet y directly; profiles sit in a box whose top is at y 290.
const SLOT_X = [36, 266, 470, 740] as const
const PROFILE_Y = 290
const OUTLINE = { stroke: '#000000', width: 1.5 }

function zonePath(d: string, zone: ZoneId, m: Mockup): SVGPathElement {
  // data-zone is how the editor knows which zone was clicked (and which to highlight in other views).
  return el('path', { d, fill: zoneFill(m, zone), 'data-zone': zone })
}

const isProfile = (kind: ViewKind) => kind === 'left' || kind === 'right'

/** Where each view slot sits on the sheet. Placements use this as their local origin. */
export function slotOrigin(m: Mockup, index: number): { x: number; y: number } {
  return { x: SLOT_X[index], y: isProfile(m.views[index].kind) ? PROFILE_Y : 0 }
}

/**
 * Draw one view as a <g>. Paint order: base colour fills the whole outline,
 * zones go on top clipped to the outline, then the black outline stroke.
 * Clipping means a traced zone that pokes past the edge can never show outside the sock.
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
  let outline: string
  let base: ZoneId
  let zones: { zone: ZoneId; d: string }[]

  if (isProfile(kind)) {
    // ankle-tab has no traced profile of its own yet; it shares the ankle outline.
    const id = m.template === 'crew' ? 'crew' : 'ankle'
    // Use a traced Right when Peter drew one (ankle); otherwise mirror the Left inside its slot.
    const traced = kind === 'right' ? PROFILES_RIGHT[id] : undefined
    const profile = traced ?? PROFILES[id]
    outline = profile.silhouette
    base = 'leg'
    zones = (['cuff', 'heel', 'toe'] as const).map((zone) => ({ zone, d: profile.zones[zone] }))
    if (kind === 'right' && !traced) flip = `translate(${PROFILE_SIZE.width} 0) scale(-1 1)`
  } else {
    const flat = flatView(kind, m.stripes, m.midBand, HEEL_Y[m.template])
    outline = flat.outline
    base = flat.base
    zones = flat.zones
  }

  const o = slotOrigin(m, index)
  const g = el('g', { transform: `translate(${o.x} ${o.y})`, 'data-view': index })
  const clip = el('clipPath', { id: clipId })
  clip.append(el('path', { d: outline }))
  const placeClip = el('clipPath', { id: placementClipId })
  placeClip.append(el('path', flip ? { d: outline, transform: flip } : { d: outline }))
  g.append(clip, placeClip)

  const line = (d: string) =>
    el('path', {
      d,
      fill: 'none',
      stroke: OUTLINE.stroke,
      'stroke-width': OUTLINE.width,
      'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
      'pointer-events': 'none',
    })

  // Zone boundaries get the same black line as the outline (design brief A4: cuff line, toe line,
  // heel ellipse). They're stroked inside the clip, so the parts of a zone that run past the
  // sock edge never show.
  const sock = el('g', flip ? { transform: flip, 'data-part': 'sock' } : { 'data-part': 'sock' })
  const painted = el('g', { 'clip-path': `url(#${clipId})` })
  painted.append(
    zonePath(outline, base, m),
    ...zones.map((z) => zonePath(z.d, z.zone, m)),
  )
  // Grip dots go over the zone colours but under the zone lines (Peter's REWD heel).
  const dots = isProfile(kind) ? null : gripDots(m, index)
  if (dots) painted.append(dots)
  painted.append(...zones.map((z) => line(z.d)))
  sock.append(painted)
  g.append(sock)
  // The outer outline is returned separately so the sheet can draw it above clipped logos.
  const top = line(outline)
  if (flip) top.setAttribute('transform', flip)
  return { g, outline: top, placementClipId }
}
