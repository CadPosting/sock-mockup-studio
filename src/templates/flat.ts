// Flat tube views (front / back / sole), measured off Peter's ankle template slide.
// Unlike the side profiles these are simple geometry, so they're written by hand, not traced.
// Coordinates are local to a flat slot: x 0-176 (the tube's width), y in sheet units.

import type { ZoneId } from '../model/types'

export const FLAT_WIDTH = 176

const L = 0
const R = FLAT_WIDTH
const TOP = 308 // top of the tube on front/back
const SOLE_TOP = 340 // sole view starts lower: the heel cap sits above it
const BOTTOM = 690 // where the toe cap starts
const CAP_RX = FLAT_WIDTH / 2
const CAP_RY = 40 // toe and heel caps bulge ~40 units past the tube

const CUFF_H = 27
const STRIPE_H = 10
const STRIPE_GAP = 10
const BAND_Y = 480
const BAND_H = 30

export type FlatKind = 'front' | 'back' | 'sole'

export type FlatPaths = {
  /** Outer outline: the clip path and the black stroke. */
  outline: string
  /** Zone painted under everything else, filling the whole tube. */
  base: ZoneId
  /** Zones drawn on top of the base, in paint order, clipped to the outline. */
  zones: { zone: ZoneId; d: string }[]
}

const rect = (y: number, h: number) => `M${L} ${y}H${R}V${y + h}H${L}Z`
const toeCap = `M${L} ${BOTTOM}H${R}A${CAP_RX} ${CAP_RY} 0 0 1 ${L} ${BOTTOM}Z`

/** Optional stripes under the cuff and a band across the middle (front and back only). */
function extras(top: number, stripes: 0 | 1 | 2, midBand: boolean): FlatPaths['zones'] {
  const out: FlatPaths['zones'] = []
  const first = top + CUFF_H + STRIPE_GAP
  if (stripes >= 1) out.push({ zone: 'stripe1', d: rect(first, STRIPE_H) })
  if (stripes >= 2) out.push({ zone: 'stripe2', d: rect(first + STRIPE_H + STRIPE_GAP, STRIPE_H) })
  if (midBand) out.push({ zone: 'band', d: rect(BAND_Y, BAND_H) })
  return out
}

/**
 * Centre y of the Back view's heel ellipse. Peter places it differently per sock:
 * measured by overlay on DWU/Impact (ankle), PYC (ankle tab) and REWD/StFX (crew).
 */
export const HEEL_Y = { crew: 495, ankle: 425, 'ankle-tab': 455 } as const

export function flatView(
  kind: FlatKind,
  stripes: 0 | 1 | 2,
  midBand: boolean,
  heelY: number = HEEL_Y.ankle,
): FlatPaths {
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
    }
  }

  const outline = `M${L} ${TOP}H${R}V${BOTTOM}A${CAP_RX} ${CAP_RY} 0 0 1 ${L} ${BOTTOM}Z`
  const zones: FlatPaths['zones'] = [{ zone: 'cuff', d: rect(TOP, CUFF_H) }, ...extras(TOP, stripes, midBand)]
  if (kind === 'back') {
    // Heel ellipse spans the tube's full width.
    zones.push({
      zone: 'heel',
      d: `M${L} ${heelY}A${CAP_RX} ${CAP_RY} 0 1 0 ${R} ${heelY}A${CAP_RX} ${CAP_RY} 0 1 0 ${L} ${heelY}Z`,
    })
  }
  zones.push({ zone: 'toe', d: toeCap })
  return { outline, base: 'leg', zones }
}
