// One state object, changed only through dispatch(), with undo/redo (TDD §2).

import type { Mockup } from '../model/types'
import { type Action, apply } from './actions'

const HISTORY_LIMIT = 200

export type Store = ReturnType<typeof createStore>

export function createStore(initial: Mockup) {
  let state = initial
  let past: Mockup[] = []
  let future: Mockup[] = []
  // While a drag is in progress, `gestureStart` holds the state from before it. Moves update
  // the screen but not history; endGesture() records the whole drag as one undo step.
  let gestureStart: Mockup | null = null
  const listeners = new Set<(m: Mockup) => void>()

  const emit = () => listeners.forEach((fn) => fn(state))

  const record = (before: Mockup) => {
    past.push(before)
    if (past.length > HISTORY_LIMIT) past = past.slice(-HISTORY_LIMIT)
    future = []
  }

  return {
    get: () => state,

    subscribe(fn: (m: Mockup) => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },

    dispatch(action: Action) {
      const next = apply(state, action)
      if (next === state) return // no-op actions (unknown id etc.) don't create undo steps
      if (!gestureStart) record(state)
      state = next
      emit()
    },

    beginGesture() {
      gestureStart ??= state
    },

    endGesture() {
      if (gestureStart && gestureStart !== state) record(gestureStart)
      gestureStart = null
    },

    undo() {
      const prev = past.pop()
      if (!prev) return
      future.push(state)
      state = prev
      emit()
    },

    redo() {
      const next = future.pop()
      if (!next) return
      past.push(state)
      state = next
      emit()
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    /** Replace the whole mockup (open file, resume draft, new). Starts a fresh history. */
    load(m: Mockup) {
      state = m
      past = []
      future = []
      gestureStart = null
      emit()
    },
  }
}
