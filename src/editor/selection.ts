// What's selected in the editor. Editor-only state: it's never saved, autosaved or exported,
// and changing it is not an undo step.

import type { ZoneId } from '../model/types'

export type Selection = { kind: 'zone'; zone: ZoneId } | { kind: 'gripDots' } | { kind: 'motif' } | null

export function createSelection() {
  let current: Selection = null
  const listeners = new Set<(s: Selection) => void>()
  return {
    get: () => current,
    set(s: Selection) {
      current = s
      listeners.forEach((fn) => fn(s))
    },
    subscribe(fn: (s: Selection) => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export type SelectionStore = ReturnType<typeof createSelection>
