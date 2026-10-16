// Header block: client logo, SAMPLE / style-code tag, title, spec list, optional palette table.
// Positions and sizes are measured off Peter's PNGs (text widths matched against Arial, which has
// Arimo's metrics): DWU/Impact for 1 column, PYC/REWD/Nutrio for 2 columns, StFX for the style code
// and palette table. The sizes in the first draft of the design brief were ~20% too small.

import type { Mockup, SpecRow } from '../model/types'
import { isArimoLoaded } from '../io/fonts'
import { hexToCmyk, hexToRgb } from '../util/color'
import { el } from './dom'

const FONT = 'Arimo, Arial, Helvetica, sans-serif'
export const SAMPLE_RED = '#e0432b'

const LOGO_BOX = { x: 24, y: 28, width: 336, height: 97 }
/**
 * The logo box ends before the title. The brief's box (x 24-360) is right for 1 column (title at
 * x 400) but overlaps the 2-column title at x 340, so there it stops at x 324.
 */
const logoBox = (m: Mockup) => (m.header.columns === 2 ? { ...LOGO_BOX, width: 300 } : LOGO_BOX)
// PYC/REWD: 117x33 box at 92,171, bold 21 text. Under a short, wide logo (DWU) Peter moves it
// up to y 117; tagY() decides from the logo's shape.
const TAG = { x: 92, y: 171, highY: 117, padX: 6, height: 33, baseline: 25, size: 21 }
const SHORT_LOGO = 60 // drawn height below which the logo counts as "short"

/** Tag top: up close under a short, wide logo, otherwise Peter's usual spot. */
export function tagY(m: Mockup): number {
  const a = m.header.logoAssetId ? m.assets[m.header.logoAssetId] : undefined
  if (!a?.width || !a.height) return TAG.y
  const box = logoBox(m)
  const drawn = Math.min(box.height, (box.width * a.height) / a.width) // "contain" fit
  return drawn < SHORT_LOGO ? TAG.highY : TAG.y
}

// 1 column (DWU): bold 30 title and 21px specs at x 400, lines every 25 units.
// 2 columns (PYC): regular 28 title at 340, bulleted 15px columns at 340 and 650, 17 units apart.
const LAYOUT = {
  1: { titleX: 400, titleSize: 30, titleBaseline: 85, cols: [400], firstBaseline: 129, lineHeight: 25, size: 21, wrapWidth: 600 },
  2: { titleX: 340, titleSize: 28, titleBaseline: 86, cols: [340, 650], firstBaseline: 119, lineHeight: 17, size: 15, wrapWidth: 270 },
} as const
const BULLET_INDENT = 22

function text(content: string, attrs: Record<string, string | number>): SVGTextElement {
  const t = el('text', { 'font-family': FONT, fill: '#000000', ...attrs })
  t.textContent = content // all header text is user text: textContent only, never markup
  return t
}

/**
 * Rough width of a string in Arimo. SVG has no auto-wrap, and measuring with the real font
 * would need a live layout (not available in tests or before fonts load). Arimo's average
 * glyph is ~0.5em; this only decides where 2-column specs wrap, so close is enough.
 */
export function approxWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) w += ch === ' ' ? 0.28 : /[A-Z]/.test(ch) ? 0.65 : /[il.,:;|'!]/.test(ch) ? 0.25 : 0.52
  return w * size
}

let measureCtx: CanvasRenderingContext2D | null | undefined

/**
 * Width of a string in Arimo. In a browser, once our bundled Arimo has loaded, this is the real
 * measured width; elsewhere (tests, or if the font failed to load) it's approxWidth. The editor
 * waits for the fonts before its first render, so screen and exports always measure the same. Used for the
 * label underlines and 2-column wrapping, where a few units off would show.
 */
export function textWidth(s: string, size: number, weight = 400): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    } catch {
      measureCtx = null // jsdom: no canvas
    }
  }
  const font = `${weight} ${size}px Arimo`
  if (!measureCtx || !isArimoLoaded()) return approxWidth(s, size)
  measureCtx.font = font
  return measureCtx.measureText(s).width
}

/** Greedy word wrap. The first line is shorter by `firstOffset` (the bold/underlined label). */
export function wrap(s: string, width: number, size: number, firstOffset = 0): string[] {
  const lines: string[] = []
  let line = ''
  let limit = width - firstOffset
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size) > limit) {
      lines.push(line)
      line = word
      limit = width
    } else line = next
  }
  if (line || lines.length === 0) lines.push(line)
  return lines
}

function logo(m: Mockup): SVGElement | null {
  const asset = m.header.logoAssetId ? m.assets[m.header.logoAssetId] : undefined
  if (!asset) return null // no logo: leave the space empty (the editor shows a drop box instead)
  // Always an <image> with a data URL, never inlined markup: browsers don't run scripts in
  // SVGs loaded this way (TDD §8).
  return el('image', {
    href: asset.dataUrl,
    ...logoBox(m),
    preserveAspectRatio: 'xMinYMid meet',
  })
}

function tag(m: Mockup): SVGElement {
  const t = m.header.tag
  const g = el('g', { 'data-part': 'tag' })
  if (t.mode === 'sample') {
    const label = `SAMPLE ${t.n}`
    const w = approxWidth(label, TAG.size) * 1.08 + TAG.padX * 2 // bold runs ~8% wider
    const y = tagY(m)
    g.append(
      el('rect', { x: TAG.x, y, width: w, height: TAG.height, fill: SAMPLE_RED }),
      text(label, {
        x: TAG.x + w / 2,
        y: y + TAG.baseline,
        'text-anchor': 'middle',
        'font-size': TAG.size,
        'font-weight': 700,
        fill: '#ffffff',
        'data-field': 'tag:n',
      }),
    )
  } else {
    // Style code (StFX): two centred lines of red text, size 30, no box.
    const cx = 216
    g.append(
      text(t.line1, { x: cx, y: 162, 'text-anchor': 'middle', 'font-size': 30, fill: SAMPLE_RED, 'data-field': 'tag:line1' }),
      text(t.line2, { x: cx, y: 195, 'text-anchor': 'middle', 'font-size': 30, fill: SAMPLE_RED, 'data-field': 'tag:line2' }),
    )
  }
  return g
}

/** One spec row as a <text> with one <tspan> per wrapped line. */
function specRow(row: SpecRow, x: number, y: number, cols: 1 | 2): { node: SVGTextElement; lines: number; underline?: SVGLineElement } {
  const L = LAYOUT[cols]
  const t = el('text', { 'font-family': FONT, 'font-size': L.size, fill: '#000000', 'data-field': `spec:${row.id}` })
  const indent = cols === 2 ? BULLET_INDENT : 0
  const labelText = row.label ? `${row.label}:` : ''
  const labelW = labelText ? textWidth(labelText + ' ', L.size) : 0
  const lines = wrap(row.value, L.wrapWidth - indent, L.size, labelW)

  if (cols === 2) {
    const bullet = el('tspan', { x, y })
    bullet.textContent = '•'
    t.append(bullet)
  }
  lines.forEach((line, i) => {
    const lineY = y + i * L.lineHeight
    if (i === 0 && labelText) {
      const label = el('tspan', { x: x + indent, y: lineY, 'data-field': `spec-label:${row.id}` })
      label.textContent = row.label
      const colon = el('tspan', {})
      colon.textContent = ': ' // colon and space aren't underlined, as on Peter's sheets
      t.append(label, colon)
      const value = el('tspan', {})
      value.textContent = line
      t.append(value)
    } else {
      const value = el('tspan', { x: x + indent, y: lineY })
      value.textContent = line
      t.append(value)
    }
  })
  // The label underline is a real line, not text-decoration: svg2pdf ignores text-decoration,
  // so the PDF would lose it (and the PNG and PDF must match).
  const underline = labelText
    ? el('line', {
        x1: x + indent,
        x2: x + indent + textWidth(row.label, L.size),
        y1: y + L.size * 0.13,
        y2: y + L.size * 0.13,
        stroke: '#000000',
        'stroke-width': L.size * 0.06,
        'pointer-events': 'none',
      })
    : undefined
  return { node: t, lines: lines.length, underline }
}

function specs(m: Mockup): SVGElement {
  const { columns } = m.header
  const L = LAYOUT[columns]
  const rows = m.header.specs.filter((r) => r.visible)
  // Peter's 2-column sheets put the smaller half on the left (PYC 4|5, REWD 4|4, Nutrio 6|6).
  const split = columns === 2 ? Math.floor(rows.length / 2) : rows.length
  const groups = columns === 2 ? [rows.slice(0, split), rows.slice(split)] : [rows]
  const g = el('g', { 'data-part': 'specs' })
  groups.forEach((group, c) => {
    let y = L.firstBaseline
    for (const row of group) {
      const { node, lines, underline } = specRow(row, L.cols[c], y, columns)
      g.append(node)
      if (underline) g.append(underline)
      y += lines * L.lineHeight
    }
  })
  return g
}

// StFX layout: swatch · CMYK · RGB · HEX, x 540-930.
const PAL = { swatchX: 543, cmykX: 595, rgbX: 748, hexX: 866, ruleEnd: 928, headerY: 88, firstY: 133, step: 43 }

function palette(m: Mockup): SVGElement | null {
  const { show, rows } = m.header.palette
  if (!show || rows.length === 0) return null
  const g = el('g', { 'data-part': 'palette', 'font-family': FONT })
  const small = { 'font-size': 10, fill: '#333333' }
  g.append(
    text('Print 4c Process', { x: PAL.cmykX, y: PAL.headerY, ...small, 'font-weight': 700 }),
    text('RGB', { x: PAL.rgbX, y: PAL.headerY, ...small, 'font-weight': 700 }),
    text('HEX', { x: PAL.hexX, y: PAL.headerY, ...small, 'font-weight': 700 }),
  )
  rows.forEach((row, i) => {
    const cy = PAL.firstY + i * PAL.step
    const [r, gr, b] = hexToRgb(row.hex)
    // A typed-in CMYK from the brand guide wins over the formula, which is only approximate.
    const cmyk = row.cmyk || `${hexToCmyk(row.hex).map((v, j) => `${v}${'CMYK'[j]}`).join(' ')} (approx.)`
    g.append(
      text(row.name, { x: PAL.swatchX, y: cy - 18, 'font-size': 6, fill: '#555555', 'data-field': `pal-name:${i}` }),
      el('rect', { x: PAL.swatchX, y: cy - 15, width: 30, height: 30, fill: row.hex, stroke: '#dddddd', 'stroke-width': 0.5 }),
      text(cmyk, { x: PAL.cmykX, y: cy + 4, ...small, 'data-field': `pal-cmyk:${i}` }),
      text(`${r}R ${gr}G ${b}B`, { x: PAL.rgbX, y: cy + 4, ...small }),
      text(row.hex.slice(1).toLowerCase(), { x: PAL.hexX, y: cy + 4, ...small }),
      el('line', { x1: PAL.cmykX, x2: PAL.ruleEnd, y1: cy + 21, y2: cy + 21, stroke: '#dddddd', 'stroke-width': 0.5 }),
    )
  })
  return g
}

export function renderHeader(m: Mockup): SVGGElement {
  const g = el('g', { 'data-part': 'header' })
  const h = m.header
  const logoNode = logo(m)
  if (logoNode) g.append(logoNode)
  g.append(tag(m))
  g.append(
    text(h.title, {
      x: LAYOUT[h.columns].titleX,
      y: LAYOUT[h.columns].titleBaseline,
      'font-size': LAYOUT[h.columns].titleSize,
      'font-weight': h.titleBold ? 700 : 400,
      'data-field': 'title',
    }),
    specs(m),
  )
  const pal = palette(m)
  if (pal) g.append(pal)
  return g
}
