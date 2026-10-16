// Every edit is a named action, applied by one pure function. State is never mutated: each
// action returns a new Mockup that shares every untouched part with the old one, which is what
// makes undo cheap (history just keeps references) and render() safe to call on any of them.

import type { Asset, ColorRef, GripDots, Header, Mockup, Motif, Placement, SpecRow, ViewSlot, ZoneId, ZonePattern } from '../model/types'
import { MAX_PLACEMENTS, MAX_SPECS } from '../model/schema'
import { sameLook } from '../render/patterns'
import { acrossProfiles } from '../render/placements'

export type Action =
  | { type: 'setZoneColor'; zone: ZoneId; color: ColorRef }
  | { type: 'setZonePattern'; zone: ZoneId; pattern: ZonePattern | null }
  | { type: 'setStripes'; stripes: 0 | 1 | 2 }
  | { type: 'setMidBand'; on: boolean }
  | { type: 'setTemplate'; template: Mockup['template'] }
  | { type: 'applyStyle'; style: Mockup }
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

/** Zones that copy the leg while they still look identical to it. */
const FOLLOW_LEG: ZoneId[] = ['foot', 'sole']
const followers = (m: Mockup, zone: ZoneId): ZoneId[] => (zone === 'leg' ? FOLLOW_LEG.filter((z) => sameLook(m, z, 'leg')) : [])

/** The view index on the other side of a profile view, if this mockup has one. */
function oppositeView(m: Mockup, view: number): number | undefined {
  const other = PROFILE_PAIR[m.views[view].kind]
  if (!other) return undefined
  const i = m.views.findIndex((v) => v.kind === other)
  return i >= 0 ? i : undefined
}

/** True when two placements sit on opposite profile views (one Left, one Right). */
function oppositeSides(m: Mockup, a: Placement, b: Placement): boolean {
  const ka = m.views[a.view]?.kind
  const kb = m.views[b.view]?.kind
  return (ka === 'left' && kb === 'right') || (ka === 'right' && kb === 'left')
}

/** The linked partner of a placement: its mirror copy, or the original it mirrors. */
function partner(m: Mockup, p: Placement): Placement | undefined {
  return m.placements.find((q) => q.id !== p.id && (q.mirrorOf === p.id || p.mirrorOf === q.id))
}

/** The copy of `source` on profile view `view` (Left <-> Right), for this mockup's template. */
function copyAcross(m: Mockup, source: Placement, view: number, id: string): Placement {
  const kind = m.views[source.view].kind
  return acrossProfiles(m.template, kind === 'right' ? 'right' : 'left', source, view, id)
}

/** Rebuild `target` as the copy of `source`, keeping target's own id, view and link field. */
function resync(m: Mockup, source: Placement, target: Placement): Placement {
  return { ...copyAcross(m, source, target.view, target.id), mirrorOf: target.mirrorOf }
}

/**
 * After the template (or view set) changes, rebuild every linked copy from its original with the
 * new template's Left <-> Right mapping, so a later edit doesn't make the copy jump.
 */
function resyncLinked(m: Mockup): Mockup {
  if (!m.placements.some((p) => p.mirrorOf)) return m
  const byId = new Map(m.placements.map((p) => [p.id, p]))
  return {
    ...m,
    placements: m.placements.map((p) => {
      const original = p.mirrorOf ? byId.get(p.mirrorOf) : undefined
      if (!original) return p
      if (!oppositeSides(m, original, p)) {
        // The view change broke the pair (e.g. Right became Back): unlink, keep both where they are.
        const { mirrorOf: _, ...plain } = p
        return plain
      }
      return resync(m, original, p)
    }),
  }
}

export function apply(m: Mockup, a: Action): Mockup {
  switch (a.type) {
    case 'setZoneColor': {
      // The foot and sole follow the leg for as long as they look exactly like it, so colouring
      // "the sock" still colours all of it. Once given their own look, they stay independent.
      const zones = { ...m.zones, [a.zone]: a.color }
      for (const z of followers(m, a.zone)) zones[z] = a.color
      return { ...m, zones }
    }

    case 'setZonePattern': {
      const targets = [a.zone, ...followers(m, a.zone)]
      const rest = m.zoneFills.filter((f) => !targets.includes(f.zone))
      return { ...m, zoneFills: a.pattern ? [...rest, ...targets.map((zone) => ({ zone, pattern: a.pattern! }))] : rest }
    }

    case 'setStripes':
      return { ...m, stripes: a.stripes }
    case 'setMidBand':
      return { ...m, midBand: a.on }
    case 'setTemplate':
      return resyncLinked({ ...m, template: a.template })

    // Switch sock style (Crew, Crew Grip, ...): take the style's sock and header defaults, keep
    // everything that is the client's design (colours, patterns, logo, placements, client name).
    case 'applyStyle': {
      const s = a.style
      return resyncLinked({
        ...m,
        template: s.template,
        views: s.views,
        patterns: { ...m.patterns, gripDots: s.patterns.gripDots },
        header: {
          ...m.header,
          tag: m.header.tag.mode === 'sample' && s.header.tag.mode === 'sample' ? m.header.tag : s.header.tag,
          title: s.header.title,
          titleBold: s.header.titleBold,
          columns: s.header.columns,
          specs: s.header.specs,
        },
      })
    }
    case 'setPageColor':
      return { ...m, pageColor: a.pageColor }

    case 'setViews':
      // Placements are view-local, so they keep their spot when the view set changes (TDD §3).
      return resyncLinked({ ...m, views: a.views })
    case 'setViewLabel': {
      const views = m.views.map((v, i): ViewSlot => (i === a.index ? { ...v, label: a.label } : v)) as Mockup['views']
      return { ...m, views }
    }

    case 'addPlacement': {
      // PRD 5.6: on Left/Right, a mirrored copy goes on the other side by default. The caller
      // passes mirrorId to ask for it; it's skipped when there's no opposite profile view.
      const other = a.mirrorId ? oppositeView(m, a.placement.view) : undefined
      const added = other === undefined ? [a.placement] : [a.placement, copyAcross(m, a.placement, other, a.mirrorId!)]
      // Never build a mockup the file schema would reject on reload (it caps placements).
      if (m.placements.length + added.length > MAX_PLACEMENTS) return m
      return { ...m, placements: [...m.placements, ...added] }
    }

    case 'updatePlacement': {
      const p = m.placements.find((q) => q.id === a.id)
      if (!p) return m
      const next = { ...p, ...a.patch }
      const linked = partner(m, p)
      // Moving either copy moves the other (TDD §3).
      const synced = linked && oppositeSides(m, next, linked) ? resync(m, next, linked) : undefined
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
      if (m.header.specs.length >= MAX_SPECS) return m // same reason as the placement cap
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
