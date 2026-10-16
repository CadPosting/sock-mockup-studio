// One cleaning step for every way a mockup gets in: upload, opened file, restored draft.
import { MockupFileError } from '../model/schema'
import type { Mockup } from '../model/types'
import { sanitizeSvg, toDataUrl } from './upload'

/** SVG logos in an opened file or restored draft get the same cleaning as uploads (see sanitizeSvg). */
export function cleanSvgAssets(m: Mockup): Mockup {
  const assets = { ...m.assets }
  for (const [id, a] of Object.entries(assets)) {
    if (a.mime !== 'image/svg+xml') continue
    const text = new TextDecoder().decode(Uint8Array.from(atob(a.dataUrl.split(',')[1]), (c) => c.charCodeAt(0)))
    const clean = sanitizeSvg(text)
    if (!clean) throw new MockupFileError("This file isn't a Sock Mockup Studio file (or it's damaged).")
    assets[id] = { ...a, dataUrl: toDataUrl(new TextEncoder().encode(clean), 'image/svg+xml') }
  }
  return { ...m, assets }
}

