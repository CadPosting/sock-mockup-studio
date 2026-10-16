// Parts of the side profiles that Peter's flat-colour template slides don't have, so they can't
// be traced: the ankle tab's flap, the mid band, and the foot. Written by hand in the LEFT
// profile's local coordinates (265 x 440 slot), measured off the reference sheets. Right gets them
// through the crew mirror or the fitted ankle map, so they're only defined once.

import type { TemplateId } from '../model/types'

/** A band across the sock between two centre points, `half` units either side of the line. */
function band(x0: number, y0: number, x1: number, y1: number, half: number): string {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const nx = (-(y1 - y0) / len) * half
  const ny = ((x1 - x0) / len) * half
  const f = (v: number) => Math.round(v * 10) / 10
  return `M${f(x0 + nx)} ${f(y0 + ny)}L${f(x1 + nx)} ${f(y1 + ny)}L${f(x1 - nx)} ${f(y1 - ny)}L${f(x0 - nx)} ${f(y0 - ny)}Z`
}

export type ProfileExtras = {
  /** Extra outline shape that's part of the cuff (the ankle tab's fold-over flap, PYC). */
  flap: string | null
  /** Peter's own Right flap, in the Right slot's coordinates (he drew it differently from Left). */
  flapRight?: string
  /** The mid band. Ends run past the sock edge; the outline clips them. */
  band: string
  /** The foot: drawn only when it's coloured differently from the leg. */
  foot: string
  /**
   * Region on the sole side of the foot. The sole edge is the sock's own outline stroked thick and
   * clipped to this region, so it hugs the outline exactly, curves included. Drawn only when the
   * sole differs from the leg. Bounded by lines measured off the traced outlines (crew: heel bottom
   * to toe start; ankle: down the back from heel to toe); heel and toe paint over its ends.
   */
  soleRegion: string
}

export const PROFILE_EXTRAS: Record<TemplateId, ProfileExtras> = {
  // Leg runs straight down from the cuff; the band crosses it a third of the way down (crew
  // sheets don't show one, so this mirrors the flat view's proportion). Foot = below the ankle.
  crew: {
    flap: null,
    band: band(-20, 130, 285, 130, 15),
    foot: 'M-20 238H285V460H-20Z',
    soleRegion: 'M203 325L77 427L149 516L275 414Z',
  },
  // DWU: the band crosses the instep diagonally, from the heel side down to the front.
  ankle: {
    flap: null,
    band: band(85, 303, 262, 194, 23),
    foot: 'M-20 175H285V460H-20Z',
    soleRegion: 'M186 60L264 440L362 420L284 40Z',
  },
  // PYC: a straight-edged flap behind the cuff, folded over at the back of the ankle.
  'ankle-tab': {
    flap: 'M46 42L72 33L57.5 128L37 110L48 55Z',
    flapRight: 'M162 22L195.5 25.5L197 39.5L217.5 91L200.5 112.5L190 85L177.5 45Z',
    band: band(85, 303, 262, 194, 23),
    foot: 'M-20 175H285V460H-20Z',
    soleRegion: 'M186 60L264 440L362 420L284 40Z',
  },
}
