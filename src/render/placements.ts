// Logos and text wordmarks placed on a view (PRD 5.6). Coordinates are view-local: the same
// origin as the view's slot, never flipped, so a mirrored Right doesn't mirror the glyphs.

import type { FontId, Mockup, Placement } from '../model/types'
import { PROFILE_SIZE, type ProfileMap, RIGHT_FROM_LEFT } from '../templates/profiles.generated'
import { el } from './dom'

/** A placement at scale 1: images fit a 100x100 box, text is 24 units tall. */
export const BASE = { image: 100, text: 24 }

export const FONTS: Record<FontId, { family: string; weight: number }> = {
  arimo: { family: 'Arimo, Arial, Helvetica, sans-serif', weight: 700 },
  oswald: { family: 'Oswald, "Arial Narrow", sans-serif', weight: 500 },
  baskerville: { family: '"Libre Baskerville", Georgia, serif', weight: 400 },
}

/**
 * The linked copy on the opposite side (TDD §3): the position flips across the view, the
 * rotation reverses, the content itself is not flipped, so text never reads backwards.
 * Exact where Right is the mirrored Left (crew). See `acrossProfiles` for the ankle.
 */
export function mirrored(p: Placement, view: number, id: string): Placement {
  return {
    ...structuredClone(p),
    id,
    view,
    x: PROFILE_SIZE.width - p.x,
    rotation: -p.rotation,
    mirrorOf: p.id,
  }
}

const deg = (r: number) => (r * 180) / Math.PI

/**
 * The linked copy on the other profile view, for any template. Peter's ankle Right is drawn on its
 * own (not a mirror of Left), so there the flipped position also goes through RIGHT_FROM_LEFT, a
 * rotate + scale + shift fitted to the two traced outlines at build time (landmark error 0.3
 * units). Going Right -> Left uses the inverse, so moving either copy keeps the other in place.
 */
export function acrossProfiles(template: Mockup['template'], fromKind: 'left' | 'right', p: Placement, view: number, id: string): Placement {
  const map: ProfileMap | undefined = RIGHT_FROM_LEFT[template === 'crew' ? 'crew' : 'ankle']
  if (!map) return mirrored(p, view, id)
  const s = Math.hypot(map.a, map.b)
  const theta = deg(Math.atan2(map.b, map.a))
  const out = { ...structuredClone(p), id, view, mirrorOf: p.id }
  if (fromKind === 'left') {
    const qx = PROFILE_SIZE.width - p.x // mirror first...
    const qy = p.y
    out.x = map.a * qx - map.b * qy + map.tx // ...then onto Peter's Right
    out.y = map.b * qx + map.a * qy + map.ty
    out.rotation = -p.rotation + theta
    out.scale = p.scale * s
  } else {
    const rx = p.x - map.tx // undo the shift, then the rotate + scale...
    const ry = p.y - map.ty
    const k = 1 / (map.a * map.a + map.b * map.b)
    const qx = k * (map.a * rx + map.b * ry)
    const qy = k * (-map.b * rx + map.a * ry)
    out.x = PROFILE_SIZE.width - qx // ...then mirror back onto Left
    out.y = qy
    out.rotation = theta - p.rotation
    out.scale = p.scale / s
  }
  out.rotation = ((((out.rotation + 180) % 360) + 360) % 360) - 180
  out.scale = Math.min(20, Math.max(0.01, out.scale))
  return out
}

/** The matrix that draws ankle-Right extras (tab flap, mid band) traced on Left onto Right. */
export function rightFromLeftTransform(template: Mockup['template']): string | null {
  const map = RIGHT_FROM_LEFT[template === 'crew' ? 'crew' : 'ankle']
  if (!map) return null
  // map ∘ mirror, where mirror(x, y) = (W - x, y):
  //   x' = a(W - x) - b·y + tx = -a·x - b·y + (aW + tx)
  //   y' = b(W - x) + a·y + ty = -b·x + a·y + (bW + ty)
  // SVG matrix(A B C D E F) means x' = A·x + C·y + E, y' = B·x + D·y + F.
  const W = PROFILE_SIZE.width
  return `matrix(${-map.a} ${-map.b} ${-map.b} ${map.a} ${map.a * W + map.tx} ${map.b * W + map.ty})`
}


export function content(m: Mockup, p: Placement): SVGElement | null {
  if (p.content.type === 'image') {
    const asset = m.assets[p.content.assetId]
    if (!asset) return null // migrate() rejects files with dangling refs; this is just defensive
    const size = BASE.image * p.scale
    // Data-URL <image> only, never inlined SVG markup (TDD §8).
    return el('image', {
      href: asset.dataUrl,
      x: -size / 2,
      y: -size / 2,
      width: size,
      height: size,
      preserveAspectRatio: 'xMidYMid meet',
    })
  }
  const font = FONTS[p.content.font]
  const t = el('text', {
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': font.family,
    'font-weight': font.weight,
    'font-size': BASE.text * p.scale,
    fill: p.content.color.hex,
    'data-field': `placement:${p.id}`,
  })
  t.textContent = p.content.text // user text: textContent only
  return t
}

/**
 * Draw one view's placements. Clipped ones go in a group clipped to the sock outline (default,
 * so a logo can't hang off the edge); unclipped ones (like the DWU tiger) go on top of the outline.
 */
export function renderPlacements(m: Mockup, index: number, clipId: string): { clipped: SVGGElement; free: SVGGElement } {
  const clipped = el('g', { 'clip-path': `url(#${clipId})`, 'data-part': 'placements' })
  const free = el('g', { 'data-part': 'placements-free' })
  for (const p of m.placements) {
    if (p.view !== index) continue
    const node = content(m, p)
    if (!node) continue
    const g = el('g', {
      transform: `translate(${p.x} ${p.y}) rotate(${p.rotation})`,
      'data-placement': p.id,
    })
    g.append(node)
    ;(p.clip ? clipped : free).append(g)
  }
  return { clipped, free }
}
