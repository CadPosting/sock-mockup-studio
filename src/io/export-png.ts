// PNG export and copy-to-clipboard (PRD 5.9, TDD §6). Always renders the mockup fresh from state,
// so nothing from the editor (handles, highlights, drop box) can end up in the file.

import type { Mockup } from '../model/types'
import { render, SHEET } from '../render/sheet'
import { embeddedFontCss } from './fonts'

export const EXPORT_SCALE = 2 // 2048 x 1536 (PRD 5.9)

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/** `{client}-{style}-sample{n}.{ext}`, e.g. `mount-allison-crew-sample1.png` (TDD §6). */
export function exportFileName(m: Mockup, ext: string): string {
  const client = slug(m.header.client) || 'mockup'
  const tag = m.header.tag.mode === 'sample' ? `sample${m.header.tag.n}` : slug(m.header.tag.line1) || 'style'
  return `${client}-${m.template}-${tag}.${ext}`
}

/** The sheet as a standalone SVG document with fonts embedded. */
export async function exportSvg(m: Mockup, fontCss?: string): Promise<string> {
  const svg = render(m)
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = fontCss ?? (await embeddedFontCss(m))
  svg.prepend(style)
  return new XMLSerializer().serializeToString(svg)
}

/** Draw an SVG document onto a canvas at `scale` and encode it as PNG. Browser only. */
export async function svgToPng(svgText: string, scale = EXPORT_SCALE): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = SHEET.width * scale
    canvas.height = SHEET.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas is not available')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportPng(m: Mockup): Promise<Blob> {
  // Make sure the embedded fonts are decoded before the canvas draws the text.
  return svgToPng(await exportSvg(m))
}

/** Trigger a file download for a blob (the browser's normal download, no popups). */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Copy a PNG to the clipboard. Returns false if the browser doesn't allow it. */
export async function copyPng(png: Blob | Promise<Blob>): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    // Passing the promise keeps Safari's "user gesture" requirement satisfied.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return true
  } catch {
    return false
  }
}
