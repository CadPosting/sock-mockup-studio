// Selection box and drag / scale / rotate handles (TDD §5). Drawn on a separate SVG laid over
// the sheet, so render() never outputs it and it can't leak into an export (B1.4).
//
// Drags listen on window, not on the element under the pointer: the sheet re-renders on every
// move, which would destroy that element mid-drag.

import { SVG_NS } from '../render/dom'
import { SHEET } from '../render/sheet'
import type { Store } from '../store/store'
import { angleDeg, placementBox, toSheet } from './geometry'
import type { SelectionStore } from './selection'

const HANDLE = 9 // sheet units; the overlay scales with the sheet
const ROTATE_GAP = 26
const MIN_SCALE = 0.05
const MAX_SCALE = 20
const SNAP_DEG = 15

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
  return n
}

type Op = 'move' | 'scale' | 'rotate'

export function createOverlay(store: Store, selection: SelectionStore, signal?: AbortSignal) {
  let cancelCurrent: (() => void) | null = null
  const svg = svgEl('svg', { class: 'overlay', viewBox: `0 0 ${SHEET.width} ${SHEET.height}`, 'aria-hidden': 'true' })

  function draw() {
    svg.replaceChildren()
    const sel = selection.get()
    if (sel?.kind !== 'placement') return
    const m = store.get()
    const p = m.placements.find((q) => q.id === sel.id)
    if (!p) return
    const b = placementBox(m, p)
    const g = svgEl('g', { transform: `translate(${b.cx} ${b.cy}) rotate(${b.rotation})` })
    g.append(svgEl('rect', { class: 'overlay__box', x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h }))
    g.append(svgEl('line', { class: 'overlay__stem', x1: 0, y1: -b.h / 2, x2: 0, y2: -b.h / 2 - ROTATE_GAP }))
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.append(
        svgEl('rect', {
          class: 'overlay__handle',
          'data-op': 'scale',
          x: (x * b.w) / 2 - HANDLE / 2,
          y: (y * b.h) / 2 - HANDLE / 2,
          width: HANDLE,
          height: HANDLE,
        }),
      )
    }
    g.append(svgEl('circle', { class: 'overlay__handle overlay__handle--rotate', 'data-op': 'rotate', cx: 0, cy: -b.h / 2 - ROTATE_GAP, r: HANDLE / 1.6 }))
    // The linked copy on the other side gets a lighter box, so it's clear they move together.
    const linked = m.placements.find((q) => q.id !== p.id && (q.mirrorOf === p.id || p.mirrorOf === q.id))
    if (linked) {
      const lb = placementBox(m, linked)
      const lg = svgEl('g', { transform: `translate(${lb.cx} ${lb.cy}) rotate(${lb.rotation})` })
      lg.append(svgEl('rect', { class: 'overlay__box overlay__box--linked', x: -lb.w / 2, y: -lb.h / 2, width: lb.w, height: lb.h }))
      svg.append(lg)
    }
    svg.append(g)
  }

  /** Start a drag on the selected placement. `from` is the pointerdown event. */
  function startDrag(op: Op, id: string, from: PointerEvent) {
    const start = store.get().placements.find((q) => q.id === id)
    if (!start) return
    const b = placementBox(store.get(), start)
    const p0 = toSheet(svg, from.clientX, from.clientY)
    const d0 = Math.max(1, Math.hypot(p0.x - b.cx, p0.y - b.cy))
    const a0 = angleDeg(b.cx, b.cy, p0.x, p0.y)
    store.beginGesture()

    const onMove = (e: PointerEvent) => {
      const pt = toSheet(svg, e.clientX, e.clientY)
      if (op === 'move') {
        // Translation only (views are never flipped for placements), so a sheet delta is a view delta.
        store.dispatch({ type: 'updatePlacement', id, patch: { x: start.x + pt.x - p0.x, y: start.y + pt.y - p0.y } })
      } else if (op === 'scale') {
        const k = Math.hypot(pt.x - b.cx, pt.y - b.cy) / d0
        store.dispatch({ type: 'updatePlacement', id, patch: { scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * k)) } })
      } else {
        let r = start.rotation + angleDeg(b.cx, b.cy, pt.x, pt.y) - a0
        r = ((((r + 180) % 360) + 360) % 360) - 180 // keep within -180..180
        if (e.shiftKey) r = Math.round(r / SNAP_DEG) * SNAP_DEG
        store.dispatch({ type: 'updatePlacement', id, patch: { rotation: r } })
      }
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      cancelCurrent = null
    }
    const onUp = () => {
      stop()
      store.endGesture()
    }
    // Opening another file (or unmounting) mid-drag ends the drag where it is.
    cancelCurrent = onUp
    window.addEventListener('pointermove', onMove, { signal })
    window.addEventListener('pointerup', onUp, { signal })
    window.addEventListener('pointercancel', onUp, { signal })
  }

  svg.addEventListener('pointerdown', (e) => {
    const op = (e.target as Element).getAttribute('data-op') as Op | null
    const sel = selection.get()
    if (!op || sel?.kind !== 'placement') return
    e.preventDefault()
    e.stopPropagation()
    startDrag(op, sel.id, e)
  })

  return { svg, draw, startDrag, cancelDrag: () => cancelCurrent?.() }
}
