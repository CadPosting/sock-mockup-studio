// Mockup files (PRD 5.10): the whole mockup, logos embedded, as `.sockmockup.json`. Files are the
// record (TDD §7): they're what gets shared, archived and reopened for revisions.

import type { Mockup } from '../model/types'
import { downloadBlob, exportFileName } from './export-png'

export const FILE_EXT = 'sockmockup.json'

export function serializeMockup(m: Mockup): string {
  // Plain JSON; migrate() validates it on the way back in, so nothing else is needed here.
  return JSON.stringify(m)
}

export function saveMockupFile(m: Mockup): string {
  const name = exportFileName(m, FILE_EXT)
  downloadBlob(new Blob([serializeMockup(m)], { type: 'application/json' }), name)
  return name
}

/** True for files that look like mockup files (checked by name; the content is validated on open). */
export const isMockupFile = (f: File) => /\.json$/i.test(f.name) || f.type === 'application/json'

/**
 * SAMPLE n -> SAMPLE n+1 with everything else copied (PRD 5.11, app-flow Journey 3).
 * A style-code tag (StFX style) has no number to bump and stays as it is.
 */
export function nextSample(m: Mockup): Mockup {
  const next = structuredClone(m)
  if (next.header.tag.mode === 'sample') next.header.tag = { mode: 'sample', n: Math.min(999, next.header.tag.n + 1) }
  return next
}
