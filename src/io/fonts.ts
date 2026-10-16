// The sheet's fonts, bundled with the app (TDD §6): nothing is loaded from Google at runtime.
// Arimo has Helvetica/Arial's metrics (Peter's Keynote font), so sheet text measures the same.
// Fonts are OFL-licensed, from the @fontsource packages; only the Latin subset is shipped.

import arimo400 from '@fontsource/arimo/files/arimo-latin-400-normal.woff2?url'
import arimo700 from '@fontsource/arimo/files/arimo-latin-700-normal.woff2?url'
import baskerville400 from '@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff2?url'
import oswald500 from '@fontsource/oswald/files/oswald-latin-500-normal.woff2?url'
import type { Mockup } from '../model/types'

type Face = { family: string; weight: number; url: string }

const ARIMO: Face[] = [
  { family: 'Arimo', weight: 400, url: arimo400 },
  { family: 'Arimo', weight: 700, url: arimo700 },
]
const OSWALD: Face = { family: 'Oswald', weight: 500, url: oswald500 }
const BASKERVILLE: Face = { family: 'Libre Baskerville', weight: 400, url: baskerville400 }
export const ALL_FACES: Face[] = [...ARIMO, OSWALD, BASKERVILLE]

/** The faces a mockup needs: Arimo always (sheet text), wordmark fonts only when used. */
export function facesFor(m: Mockup): Face[] {
  const used = new Set<string>()
  for (const p of m.placements) if (p.content.type === 'text') used.add(p.content.font)
  if (m.patterns.motif?.content.type === 'text') used.add(m.patterns.motif.content.font)
  return [...ARIMO, ...(used.has('oswald') ? [OSWALD] : []), ...(used.has('baskerville') ? [BASKERVILLE] : [])]
}

/** Make the fonts available to the editor page (same-origin files, allowed by font-src 'self'). */
export async function loadEditorFonts(): Promise<void> {
  if (typeof FontFace === 'undefined') return
  await Promise.all(
    ALL_FACES.map(async (f) => {
      const face = new FontFace(f.family, `url(${f.url}) format('woff2')`, { weight: String(f.weight) })
      document.fonts.add(await face.load())
    }),
  )
}

export function bytesToBase64(bytes: Uint8Array): string {
  // btoa needs a binary string; build it in chunks so large files don't overflow the call stack.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const cache = new Map<string, Promise<string>>()

/** A face as a base64 data URL, fetched once per session. */
function inlineFace(f: Face, fetchBytes: (url: string) => Promise<ArrayBuffer>): Promise<string> {
  let hit = cache.get(f.url)
  if (!hit) {
    hit = fetchBytes(f.url).then((buf) => `data:font/woff2;base64,${bytesToBase64(new Uint8Array(buf))}`)
    hit.catch(() => cache.delete(f.url)) // a failed fetch can be retried on the next export
    cache.set(f.url, hit)
  }
  return hit
}

const defaultFetch = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`font ${url}: ${r.status}`)
  return r.arrayBuffer()
}

/**
 * @font-face rules with the fonts embedded. An SVG drawn into a canvas can't load external
 * files, so without this the export would silently fall back to a default font (TDD §6).
 */
export async function embeddedFontCss(m: Mockup, fetchBytes = defaultFetch): Promise<string> {
  const faces = facesFor(m)
  const urls = await Promise.all(faces.map((f) => inlineFace(f, fetchBytes)))
  return faces
    .map((f, i) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;src:url(${urls[i]}) format('woff2');}`)
    .join('')
}
