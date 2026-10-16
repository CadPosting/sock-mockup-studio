import type { Mockup, ViewKind, ZoneId } from '../model/types'
import { flatView, HEEL_Y } from '../templates/flat'
import { PROFILE_SIZE, PROFILES, PROFILES_RIGHT } from '../templates/profiles.generated'

export const SVG_NS = 'http://www.w3.org/2000/svg'

// Left edge of each of the 4 view slots on the 1024x768 sheet, measured off Peter's slides.
// Flat tubes use sheet y directly; profiles sit in a box whose top is at y 290.
const SLOT_X = [36, 266, 470, 740] as const
const PROFILE_Y = 290
const OUTLINE = { stroke: '#000000', width: 1.5 }

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

function zonePath(d: string, zone: ZoneId, m: Mockup): SVGPathElement {
  // data-zone is how the editor knows which zone was clicked (and which to highlight in other views).
  return el('path', { d, fill: m.zones[zone].hex, 'data-zone': zone })
}

const isProfile = (kind: ViewKind) => kind === 'left' || kind === 'right'

/**
 * Draw one view as a <g>. Paint order: base colour fills the whole outline,
 * zones go on top clipped to the outline, then the black outline stroke.
 * Clipping means a traced zone that pokes past the edge can never show outside the sock.
 */
export function renderView(m: Mockup, index: number): SVGGElement {
  const kind = m.views[index].kind
  const clipId = `sock-clip-${index}`
  let transform: string
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
    transform =
      kind === 'left' || traced
        ? `translate(${SLOT_X[index]} ${PROFILE_Y})`
        : `translate(${SLOT_X[index] + PROFILE_SIZE.width} ${PROFILE_Y}) scale(-1 1)`
  } else {
    const flat = flatView(kind, m.stripes, m.midBand, HEEL_Y[m.template])
    outline = flat.outline
    base = flat.base
    zones = flat.zones
    transform = `translate(${SLOT_X[index]} 0)`
  }

  const g = el('g', { transform, 'data-view': index })
  const clip = el('clipPath', { id: clipId })
  clip.append(el('path', { d: outline }))
  g.append(clip)

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
  const painted = el('g', { 'clip-path': `url(#${clipId})` })
  painted.append(
    zonePath(outline, base, m),
    ...zones.map((z) => zonePath(z.d, z.zone, m)),
    ...zones.map((z) => line(z.d)),
  )
  g.append(painted, line(outline))
  return g
}
