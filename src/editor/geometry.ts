// Where things are on the 1024x768 sheet, for the editor's selection box and pointer maths.
// Pure functions: no DOM layout needed, so they work in tests and before fonts load.

import type { Mockup, Placement } from '../model/types'
import { approxWidth } from '../render/header'
import { BASE } from '../render/placements'
import { SHEET } from '../render/sheet'
import { slotOrigin } from '../render/views'

// Wordmark fonts run narrower or wider than Arimo; good enough for a selection box.
const FONT_WIDTH = { arimo: 1.08, oswald: 0.82, baskerville: 1.12 } as const

/** A placement's box: centre in sheet units, unrotated size, and rotation in degrees. */
export type Box = { cx: number; cy: number; w: number; h: number; rotation: number }

export function placementBox(m: Mockup, p: Placement): Box {
  const o = slotOrigin(m, p.view)
  let w: number
  let h: number
  if (p.content.type === 'image') {
    // The image is drawn "contain" inside a square box; size the selection to the image itself.
    const side = BASE.image * p.scale
    const a = m.assets[p.content.assetId]
    const ratio = a?.width && a.height ? a.width / a.height : 1
    ;[w, h] = ratio >= 1 ? [side, side / ratio] : [side * ratio, side]
  } else {
    const size = BASE.text * p.scale
    w = Math.max(size * 0.6, approxWidth(p.content.text, size) * FONT_WIDTH[p.content.font])
    h = size * 1.1
  }
  return { cx: o.x + p.x, cy: o.y + p.y, w, h, rotation: p.rotation }
}

/** Screen point -> sheet units. The sheet is always shown at exactly 4:3, so one scale fits both axes. */
export function toSheet(el: Element, clientX: number, clientY: number): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: ((clientX - r.left) * SHEET.width) / r.width, y: ((clientY - r.top) * SHEET.height) / r.height }
}

/** Default spot for a new placement: the middle of the view's sock (leg on flat views). */
export function viewCentre(m: Mockup, view: number): { x: number; y: number } {
  const kind = m.views[view].kind
  if (kind !== 'left' && kind !== 'right') return { x: 88, y: 460 }
  // Middle of the leg (crew) or of the sock body (ankle), measured on the traced Left profiles.
  return m.template === 'crew' ? { x: 193, y: 140 } : { x: 150, y: 230 }
}

export const angleDeg = (cx: number, cy: number, x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI
