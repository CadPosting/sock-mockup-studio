// Logos and text wordmarks placed on a view (PRD 5.6). Coordinates are view-local: the same
// origin as the view's slot, never flipped, so a mirrored Right doesn't mirror the glyphs.

import type { FontId, Mockup, Placement } from '../model/types'
import { PROFILE_SIZE } from '../templates/profiles.generated'
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
 * This is exact where Right is the mirrored Left (crew). Peter's ankle Right is its own drawing,
 * so there the copy can land a little off and gets nudged by hand. Kept in this one function
 * so a better mapping can replace it without touching anything else.
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
