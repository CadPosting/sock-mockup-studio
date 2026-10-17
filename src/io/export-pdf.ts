// Vector PDF export (PRD 5.9, TDD §6): the same render() output drawn by svg2pdf onto one
// 1024 x 768 pt page, so outlines stay sharp and text stays selectable for the factory.
// jsPDF + svg2pdf are big, so this whole module is loaded only on the first PDF export (TDD §9).

import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import arimoBold from '../assets/fonts/Arimo-Bold.ttf?url'
import arimoRegular from '../assets/fonts/Arimo-Regular.ttf?url'
import baskerville from '../assets/fonts/LibreBaskerville-Regular.ttf?url'
import oswald from '../assets/fonts/Oswald-Medium.ttf?url'
import type { Mockup } from '../model/types'
import { render, SHEET } from '../render/sheet'
import { bytesToBase64, facesFor } from './fonts'

// jsPDF only embeds TrueType, so these are the same faces as the woff2 files, converted once.
// The style key is what svg2pdf looks up: weight 400 = 'normal', 700 = 'bold', else e.g. '500normal'.
const TTF: Record<string, { url: string; style: string }> = {
  'Arimo 400': { url: arimoRegular, style: 'normal' },
  'Arimo 700': { url: arimoBold, style: 'bold' },
  'Oswald 500': { url: oswald, style: '500normal' },
  'Libre Baskerville 400': { url: baskerville, style: 'normal' },
}

async function fetchBase64(url: string): Promise<string> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`font ${url}: ${r.status}`)
  return bytesToBase64(new Uint8Array(await r.arrayBuffer()))
}

/** Every font family used in the sheet's text, so a missing one is caught before saving. */
function familiesUsed(svg: SVGSVGElement): Set<string> {
  const out = new Set<string>()
  for (const n of svg.querySelectorAll('[font-family]')) {
    out.add(n.getAttribute('font-family')!.split(',')[0].trim().replace(/^["']|["']$/g, ''))
  }
  return out
}

/**
 * svg2pdf ignores an embedded SVG logo's own <style> rules (a class-styled red shape comes out
 * black), so for the PDF only, SVG logos are drawn to a PNG at 4x their size on the sheet.
 * Everything else in the PDF stays vector. Browser only.
 */
async function rasterizeSvgImages(svg: SVGSVGElement, scale = 4): Promise<void> {
  for (const img of svg.querySelectorAll('image')) {
    const href = img.getAttribute('href') ?? ''
    if (!href.startsWith('data:image/svg+xml')) continue
    const boxW = Number(img.getAttribute('width'))
    const boxH = Number(img.getAttribute('height'))
    const src = new Image()
    src.src = href
    await src.decode()
    const ratio = (src.naturalWidth || boxW) / (src.naturalHeight || boxH)
    // The image is drawn "contain" in its box, so rasterize at the size it actually occupies.
    const [w, h] = ratio >= boxW / boxH ? [boxW, boxW / ratio] : [boxH * ratio, boxH]
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height)
    img.setAttribute('href', canvas.toDataURL('image/png'))
  }
}

/** One page per mockup (sheet tabs in order). */
export async function exportPdf(input: Mockup | Mockup[]): Promise<Blob> {
  const pages = Array.isArray(input) ? input : [input]
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [SHEET.width, SHEET.height], compress: true })
  const added = new Set<string>()
  for (const face of pages.flatMap((m) => facesFor(m))) {
    const key = `${face.family} ${face.weight}`
    if (added.has(key)) continue
    added.add(key)
    const ttf = TTF[key]
    const file = `${face.family.replace(/\s+/g, '')}-${face.weight}.ttf`
    doc.addFileToVFS(file, await fetchBase64(ttf.url))
    doc.addFont(file, face.family, ttf.style)
  }
  const registered = new Set(Object.keys(doc.getFontList()))
  for (const [i, m] of pages.entries()) {
    const svg = render(m)
    const missing = [...familiesUsed(svg)].filter((f) => !registered.has(f))
    if (missing.length) throw new Error(`font not available for PDF: ${missing.join(', ')}`)
    await rasterizeSvgImages(svg)
    if (i > 0) doc.addPage([SHEET.width, SHEET.height], 'landscape')
    const holder = document.createElement('div')
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;visibility:hidden'
    holder.append(svg)
    document.body.append(holder)
    try {
      await svg2pdf(svg, doc, { x: 0, y: 0, width: SHEET.width, height: SHEET.height })
    } finally {
      holder.remove()
    }
  }
  const client = pages[0].header.client
  doc.setProperties({ title: client ? `${client} sock mockup` : 'Sock mockup', creator: 'Sock Mockup Studio' })
  return doc.output('blob')
}
