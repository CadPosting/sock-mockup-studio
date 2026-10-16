// Logo upload checks (TDD §8). The file's own bytes decide its type, never its name or the
// browser's guess, so a renamed .exe is rejected. Uploaded SVGs are only ever shown through a
// data-URL <image>, where browsers don't run scripts, never inserted into the page as markup.

import type { Asset } from '../model/types'

export const MAX_LOGO_BYTES = 10 * 1024 * 1024

export const UPLOAD_ERRORS = {
  type: 'Only PNG, JPG or SVG logos.',
  size: 'Logo is over 10 MB. Export a smaller PNG and try again.',
} as const

export type LogoMime = Asset['mime']

/** Image type from the first bytes of the file, or null if it's none of the three we accept. */
export function sniffImageType(bytes: Uint8Array): LogoMime | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  // SVG is text: allow a BOM, whitespace, an XML declaration, comments or a doctype first,
  // and require a real <svg element near the start.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, '')
  // Doctypes may carry an internal subset in [...] (Illustrator writes entity declarations there).
  // Entities are never resolved here: the file is only shown later through a data-URL <image>.
  const svgStart = /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>\s*)*<svg[\s>]/i
  if (svgStart.test(head)) return 'image/svg+xml'
  return null
}

export function toDataUrl(bytes: Uint8Array, mime: LogoMime): string {
  // btoa needs a binary string; build it in chunks so large files don't overflow the call stack.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(binary)}`
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

// Allowlists (TDD §8). Only known SVG drawing elements and attributes are copied into a brand-new
// document; everything else is simply never copied. Matching is by namespace URI + local name, so
// prefix tricks (<s:script xmlns:s="...svg">, q:href) and unknown or upper-case elements can't
// slip through, and there's no scripting, animation, foreignObject, iframe or link element at all.
const ELEMENTS = new Set(
  ('svg g defs symbol use title desc path rect circle ellipse line polyline polygon text tspan image ' +
    'linearGradient radialGradient stop pattern clipPath mask marker style filter feGaussianBlur ' +
    'feOffset feBlend feColorMatrix feComposite feFlood feMerge feMergeNode feMorphology ' +
    'feComponentTransfer feFuncA feFuncR feFuncG feFuncB feDropShadow').split(' '),
)
const ATTRIBUTES = new Set(
  ('id class style transform d x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height viewBox ' +
    'preserveAspectRatio points fill fill-opacity fill-rule stroke stroke-width stroke-opacity ' +
    'stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity ' +
    'clip-path clip-rule mask filter font-family font-size font-weight font-style text-anchor ' +
    'dominant-baseline alignment-baseline letter-spacing word-spacing dx dy rotate lengthAdjust ' +
    'textLength gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity ' +
    'patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits ' +
    'markerWidth markerHeight refX refY orient markerUnits marker-start marker-mid marker-end ' +
    'visibility display color stdDeviation in in2 result mode operator k1 k2 k3 k4 values type ' +
    'flood-color flood-opacity tableValues slope intercept amplitude exponent radius version ' +
    'filterUnits primitiveUnits href').split(' '),
)
// References may only point inside the logo (#id) or at an embedded raster picture.
const SAFE_REF = /^(#[A-Za-z0-9_.:-]+|data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+)$/i

/**
 * Clean an uploaded SVG by rebuilding it from the allowlists above (TDD §8). Logos are only ever
 * shown through a data-URL <image>, where browsers don't run scripts; cleaning additionally keeps
 * outside files out (so the export canvas can't be "tainted" and PNG export keeps working) and
 * keeps the file safe if it's ever opened somewhere less careful. Parsed as XML: DOMParser runs no
 * scripts and fetches no external entities. Returns null if the text isn't an SVG document.
 */
export function sanitizeSvg(text: string): string | null {
  const src = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = src.documentElement
  if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg' || src.getElementsByTagName('parsererror').length) return null
  const out = document.implementation.createDocument(SVG_NS, 'svg', null)
  const copyInto = (from: Element, to: Element) => {
    for (const attr of [...from.attributes]) {
      const value = attr.value
      if (attr.namespaceURI === XLINK_NS && attr.localName === 'href') {
        if (SAFE_REF.test(value.trim())) to.setAttributeNS(XLINK_NS, 'xlink:href', value.trim())
      } else if (attr.namespaceURI === XML_NS && attr.localName === 'space') {
        to.setAttributeNS(XML_NS, 'xml:space', value)
      } else if (attr.namespaceURI === null && ATTRIBUTES.has(attr.localName)) {
        if (attr.localName === 'href') {
          if (SAFE_REF.test(value.trim())) to.setAttribute('href', value.trim())
        } else if (attr.localName === 'style' || /url|\\|@/i.test(value)) {
          const css = cleanCss(value)
          if (css !== null) to.setAttribute(attr.localName, css)
        } else to.setAttribute(attr.localName, value)
      }
    }
    for (const child of [...from.childNodes]) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        // Text and CDATA: for <style> it's cleaned CSS, written back as plain text.
        const t = child.nodeValue ?? ''
        to.append(out.createTextNode(from.localName === 'style' ? (cleanCss(t) ?? '') : t))
      } else if (child.nodeType === 1) {
        const el = child as Element
        if (el.namespaceURI !== SVG_NS || !ELEMENTS.has(el.localName)) continue
        // An <image> that isn't an embedded raster picture is dropped whole (tracking pixels etc.).
        if (el.localName === 'image' && !SAFE_REF.test((el.getAttribute('href') ?? el.getAttributeNS(XLINK_NS, 'href') ?? '').trim())) continue
        const copy = out.createElementNS(SVG_NS, el.localName)
        copyInto(el, copy)
        to.append(copy)
      }
      // Comments, processing instructions, entity references: never copied.
    }
  }
  copyInto(root, out.documentElement)
  return new XMLSerializer().serializeToString(out)
}

/**
 * CSS with escapes and comments decoded first (so `@im\\70ort` or `u\\72l(` can't hide), then
 * every at-rule removed and every url() not pointing at an #id replaced. Returns plain CSS.
 */
function cleanCss(css: string): string | null {
  const decoded = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex: string) => {
      const cp = parseInt(hex, 16)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
    .replace(/\\(.)/g, '$1')
    .replace(/\\/g, '')
  return decoded
    .replace(/@[a-z-]+[^;{}]*(;|\{[^}]*\})?/gi, '')
    .replace(/url\s*\(\s*(['"]?)\s*([^)'"]*)\1\s*\)/gi, (_m: string, _q: string, ref: string) => (/^#[A-Za-z0-9_.:-]+$/.test(ref.trim()) ? `url(${ref.trim()})` : 'none'))
    .replace(/expression\s*\(/gi, '')
}

export type CheckedLogo = { ok: true; mime: LogoMime; dataUrl: string } | { ok: false; message: string }

/** Size and type checks; returns the data URL to store. */
export async function checkLogoFile(file: File): Promise<CheckedLogo> {
  if (file.size > MAX_LOGO_BYTES) return { ok: false, message: UPLOAD_ERRORS.size }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffImageType(bytes)
  if (!mime) return { ok: false, message: UPLOAD_ERRORS.type }
  if (mime === 'image/svg+xml') {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes))
    if (!clean) return { ok: false, message: UPLOAD_ERRORS.type }
    return { ok: true, mime, dataUrl: toDataUrl(new TextEncoder().encode(clean), mime) }
  }
  return { ok: true, mime, dataUrl: toDataUrl(bytes, mime) }
}
