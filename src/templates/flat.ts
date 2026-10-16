// Flat tube views (front / back / sole), measured off Peter's sheets. Unlike the side profiles
// these are simple geometry, so they're written by hand, not traced.
// Coordinates are local to a flat slot: x 0-176 (the tube's width), y in sheet units.

import type { TemplateId, ZoneId } from '../model/types'

export const FLAT_WIDTH = 176

const L = 0
const R = FLAT_WIDTH
export const SOLE_TOP = 340 // sole view starts lower: the heel cap sits above it
export const BOTTOM = 690 // where the toe cap starts
const CAP_RX = FLAT_WIDTH / 2
export const CAP_RY = 40 // toe and heel caps bulge ~40 units past the tube

const CUFF_BOTTOM = 335
const STRIPE_H = 10
const STRIPE_GAP = 10
const FOOT_Y = 600 // the foot zone: the lower tube, above the toe cap

/** Per-template geometry, measured by overlay (DWU/Impact = ankle, PYC = ankle tab, REWD/StFX = crew). */
export const FLAT = {
  crew: { top: 308, fold: null, heelY: 495, band: [480, 510] },
  ankle: { top: 308, fold: null, heelY: 425, band: [492, 546] },
  // PYC: the tab adds a strip above the cuff, with a fold line where it turns over.
  'ankle-tab': { top: 284, fold: 309, heelY: 455, band: [492, 546] },
} as const satisfies Record<TemplateId, { top: number; fold: number | null; heelY: number; band: readonly [number, number] }>

/** Centre y of the Back view's heel ellipse, per template. */
export const HEEL_Y = { crew: FLAT.crew.heelY, ankle: FLAT.ankle.heelY, 'ankle-tab': FLAT['ankle-tab'].heelY } as const

export type FlatKind = 'front' | 'back' | 'sole'

export type FlatPaths = {
  /** Outer outline: the clip path and the black stroke. */
  outline: string
  /** Zone painted under everything else, filling the whole tube. */
  base: ZoneId
  /** Zones drawn on top of the base, in paint order, clipped to the outline. */
  zones: { zone: ZoneId; d: string }[]
  /** Extra black lines that aren't zone edges (the tab fold). */
  lines: string[]
}

const rect = (y: number, h: number) => `M${L} ${y}H${R}V${y + h}H${L}Z`
const toeCap = `M${L} ${BOTTOM}H${R}A${CAP_RX} ${CAP_RY} 0 0 1 ${L} ${BOTTOM}Z`

/** Optional stripes under the cuff and a band across the middle (front and back only). */
function extras(template: TemplateId, stripes: 0 | 1 | 2, midBand: boolean): FlatPaths['zones'] {
  const out: FlatPaths['zones'] = []
  const first = CUFF_BOTTOM + STRIPE_GAP
  if (stripes >= 1) out.push({ zone: 'stripe1', d: rect(first, STRIPE_H) })
  if (stripes >= 2) out.push({ zone: 'stripe2', d: rect(first + STRIPE_H + STRIPE_GAP, STRIPE_H) })
  const [b0, b1] = FLAT[template].band
  if (midBand) out.push({ zone: 'band', d: rect(b0, b1 - b0) })
  return out
}

export function flatView(kind: FlatKind, stripes: 0 | 1 | 2, midBand: boolean, template: TemplateId = 'ankle'): FlatPaths {
  if (kind === 'sole') {
    // Sole: heel cap on top, sole body, toe cap. No cuff (it's on the other side).
    const outline = `M${L} ${SOLE_TOP}A${CAP_RX} ${CAP_RY} 0 0 1 ${R} ${SOLE_TOP}V${BOTTOM}A${CAP_RX} ${CAP_RY} 0 0 1 ${L} ${BOTTOM}Z`
    const heelCap = `M${L} ${SOLE_TOP}A${CAP_RX} ${CAP_RY} 0 0 1 ${R} ${SOLE_TOP}Z`
    return {
      outline,
      base: 'sole',
      zones: [
        { zone: 'heel', d: heelCap },
        { zone: 'toe', d: toeCap },
      ],
      lines: [],
    }
  }

  const g = FLAT[template]
  const outline = `M${L} ${g.top}H${R}V${BOTTOM}A${CAP_RX} ${CAP_RY} 0 0 1 ${L} ${BOTTOM}Z`
  const zones: FlatPaths['zones'] = [
    { zone: 'foot', d: rect(FOOT_Y, BOTTOM - FOOT_Y) },
    { zone: 'cuff', d: rect(g.top, CUFF_BOTTOM - g.top) },
    ...extras(template, stripes, midBand),
  ]
  if (kind === 'back') {
    // Heel ellipse spans the tube's full width.
    zones.push({
      zone: 'heel',
      d: `M${L} ${g.heelY}A${CAP_RX} ${CAP_RY} 0 1 0 ${R} ${g.heelY}A${CAP_RX} ${CAP_RY} 0 1 0 ${L} ${g.heelY}Z`,
    })
  }
  zones.push({ zone: 'toe', d: toeCap })
  return { outline, base: 'leg', zones, lines: g.fold === null ? [] : [`M${L} ${g.fold}H${R}`] }
}
