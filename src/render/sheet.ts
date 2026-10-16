import type { Mockup } from '../model/types'
import { el, renderView, slotCenter } from './views'

export const SHEET = { width: 1024, height: 768 } // same as the Keynote slide, so PNG measurements carry over 1:1
const PAGE_COLORS = { white: '#ffffff', grey: '#f2f2f2' } as const
const LABEL_Y = 163

/**
 * Pure: the same mockup always gives the same SVG. The editor never edits this output;
 * it changes state and calls render() again. Header, placements and patterns come in later tasks.
 */
export function render(m: Mockup): SVGSVGElement {
  const svg = el('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${SHEET.width} ${SHEET.height}`,
    width: SHEET.width,
    height: SHEET.height,
  })
  svg.append(el('rect', { width: SHEET.width, height: SHEET.height, fill: PAGE_COLORS[m.pageColor] }))

  m.views.forEach((view, i) => {
    const label = el('text', {
      x: slotCenter(i, view.kind),
      y: LABEL_Y,
      'text-anchor': 'middle',
      'font-family': 'Arimo, Arial, Helvetica, sans-serif',
      'font-size': 16,
      fill: '#000000',
    })
    label.textContent = view.label // textContent, never innerHTML: labels are user text
    svg.append(label, renderView(m, i))
  })
  return svg
}
