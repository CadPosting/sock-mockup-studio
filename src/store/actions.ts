// Every edit is a named action, applied by one pure function. State is never mutated: each
// action returns a new Mockup that shares every untouched part with the old one, which is what
// makes undo cheap (history just keeps references) and render() safe to call on any of them.

import type { Asset, ColorRef, GripDots, Header, Mockup, Motif, Placement, SpecRow, ViewSlot, ZoneId, ZonePattern } from '../model/types'
import { mirrored } from '../render/placements'

export type Action =
  | { type: 'setZoneColor'; zone: ZoneId; color: ColorRef }
  | { type: 'setZonePattern'; zone: ZoneId; pattern: ZonePattern | null }
  | { type: 'setStripes'; stripes: 0 | 1 | 2 }
  | { type: 'setMidBand'; on: boolean }
  | { type: 'setTemplate'; template: Mockup['template'] }
  | { type: 'setViews'; views: Mockup['views'] }
  | { type: 'setViewLabel'; index: number; label: string }
  | { type: 'setPageColor'; pageColor: Mockup['pageColor'] }
  | { type: 'addPlacement'; placement: Placement; mirrorId?: string }
  | { type: 'updatePlacement'; id: string; patch: Partial<Omit<Placement, 'id' | 'mirrorOf'>> }
  | { type: 'removePlacement'; id: string }
  | { type: 'unlinkPlacement'; id: string }
  | { type: 'setGripDots'; gripDots: GripDots | null }
  | { type: 'setMotif'; motif: Motif | null }
  | { type: 'setHeader'; patch: Partial<Omit<Header, 'specs'>> }
  | { type: 'addSpec'; row: SpecRow }
  | { type: 'updateSpec'; id: string; patch: Partial<Omit<SpecRow, 'id'>> }
  | { type: 'removeSpec'; id: string }
  | { type: 'moveSpec'; id: string; to: number }
  | { type: 'addAsset'; id: string; asset: Asset }
  | { type: 'setLogo'; id: string; asset: Asset }
  | { type: 'removeLogo' }

const PROFILE_PAIR: Record<string, 'left' | 'right'> = { left: 'right', right: 'left' }

/** The view index on the other side of a profile view, if this mockup has one. */
function oppositeView(m: Mockup, view: number): number | undefined {
  const other = PROFILE_PAIR[m.views[view].kind]
  if (!other) return undefined
  const i = m.views.findIndex((v) => v.kind === other)
  return i >= 0 ? i : undefined
}

/** The linked partner of a placement: its mirror copy, or the original it mirrors. */
function partner(m: Mockup, p: Placement): Placement | undefined {
  return m.placements.find((q) => q.id !== p.id && (q.mirrorOf === p.id || p.mirrorOf === q.id))
}

/** Rebuild `target` as the mirror of `source`, keeping target's own id, view and link field. */
function resync(source: Placement, target: Placement): Placement {
  return { ...mirrored(source, target.view, target.id), mirrorOf: target.mirrorOf }
}

export function apply(m: Mockup, a: Action): Mockup {
  switch (a.type) {
    case 'setZoneColor':
      return { ...m, zones: { ...m.zones, [a.zone]: a.color } }

    case 'setZonePattern': {
      const rest = m.zoneFills.filter((f) => f.zone !== a.zone)
      return { ...m, zoneFills: a.pattern ? [...rest, { zone: a.zone, pattern: a.pattern }] : rest }
    }

    case 'setStripes':
      return { ...m, stripes: a.stripes }
    case 'setMidBand':
      return { ...m, midBand: a.on }
    case 'setTemplate':
      return { ...m, template: a.template }
    case 'setPageColor':
      return { ...m, pageColor: a.pageColor }

    case 'setViews':
      // Placements are view-local, so they keep their spot when the view set changes (TDD §3).
      return { ...m, views: a.views }
    case 'setViewLabel': {
      const views = m.views.map((v, i): ViewSlot => (i === a.index ? { ...v, label: a.label } : v)) as Mockup['views']
      return { ...m, views }
    }

    case 'addPlacement': {
      // PRD 5.6: on Left/Right, a mirrored copy goes on the other side by default. The caller
      // passes mirrorId to ask for it; it's skipped when there's no opposite profile view.
      const other = a.mirrorId ? oppositeView(m, a.placement.view) : undefined
      const added = other === undefined ? [a.placement] : [a.placement, mirrored(a.placement, other, a.mirrorId!)]
      return { ...m, placements: [...m.placements, ...added] }
    }

    case 'updatePlacement': {
      const p = m.placements.find((q) => q.id === a.id)
      if (!p) return m
      const next = { ...p, ...a.patch }
      const linked = partner(m, p)
      // Moving either copy moves the other (TDD §3).
      const synced = linked ? resync(next, linked) : undefined
      return {
        ...m,
        placements: m.placements.map((q) => (q.id === p.id ? next : synced && q.id === synced.id ? synced : q)),
      }
    }

    case 'removePlacement': {
      const p = m.placements.find((q) => q.id === a.id)
      if (!p) return m
      // Deleting a logo deletes its linked copy too; unlink first to keep the other one.
      const linked = partner(m, p)
      return { ...m, placements: m.placements.filter((q) => q.id !== p.id && q.id !== linked?.id) }
    }

    case 'unlinkPlacement': {
      const p = m.placements.find((q) => q.id === a.id)
      if (!p) return m
      const linked = partner(m, p)
      const ids = new Set([p.id, linked?.id])
      return {
        ...m,
        placements: m.placements.map((q) => {
          if (!ids.has(q.id) || q.mirrorOf === undefined) return q
          const { mirrorOf: _, ...plain } = q
          return plain
        }),
      }
    }

    case 'setGripDots':
      return { ...m, patterns: { ...m.patterns, gripDots: a.gripDots } }
    case 'setMotif':
      return { ...m, patterns: { ...m.patterns, motif: a.motif } }

    case 'setHeader':
      return { ...m, header: { ...m.header, ...a.patch } }
    case 'addSpec':
      return { ...m, header: { ...m.header, specs: [...m.header.specs, a.row] } }
    case 'updateSpec':
      return {
        ...m,
        header: { ...m.header, specs: m.header.specs.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)) },
      }
    case 'removeSpec':
      return { ...m, header: { ...m.header, specs: m.header.specs.filter((r) => r.id !== a.id) } }
    case 'moveSpec': {
      const specs = [...m.header.specs]
      const from = specs.findIndex((r) => r.id === a.id)
      if (from < 0) return m
      const [row] = specs.splice(from, 1)
      specs.splice(Math.max(0, Math.min(a.to, specs.length)), 0, row)
      return { ...m, header: { ...m.header, specs } }
    }

    case 'addAsset':
      return { ...m, assets: { ...m.assets, [a.id]: a.asset } }

    // Upload + use as the header logo in one undo step.
    case 'setLogo':
      return { ...m, assets: { ...m.assets, [a.id]: a.asset }, header: { ...m.header, logoAssetId: a.id } }
    case 'removeLogo': {
      // The asset itself stays: a placement may still use the same image on the sock.
      const { logoAssetId: _, ...header } = m.header
      return m.header.logoAssetId ? { ...m, header } : m
    }
  }
}
