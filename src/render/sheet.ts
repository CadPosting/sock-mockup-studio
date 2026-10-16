import type { Mockup } from '../model/types'
import { el, renderView } from './views'

export const SHEET = { width: 1024, height: 768 } // same as the Keynote slide, so PNG measurements carry over 1:1
const PAGE_COLORS = { white: '#ffffff', grey: '#ebebeb' } as const // design brief A2
// View labels sit under the header. Crew sheets put them lower (the crew profile is taller):
// measured on DWU/Impact/PYC (ankle) and REWD/Nutrio/StFX (crew).
const LABEL_Y = { crew: 291, ankle: 268, 'ankle-tab': 268 } as const // text baseline
// Peter centres labels at fixed points, not over each slot's middle (same on all six sheets).
const LABEL_X = [118, 354, 595, 855] as const

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
      x: LABEL_X[i],
      y: LABEL_Y[m.template],
      'text-anchor': 'middle',
      'font-family': 'Arimo, Arial, Helvetica, sans-serif',
      'font-size': 15,
      fill: '#000000',
    })
    label.textContent = view.label // textContent, never innerHTML: labels are user text
    svg.append(label, renderView(m, i))
  })
  return svg
}
