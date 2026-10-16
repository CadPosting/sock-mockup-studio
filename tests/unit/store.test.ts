import { describe, expect, it, vi } from 'vitest'
import { STYLE_PRESETS } from '../../src/model/defaults'
import type { Placement } from '../../src/model/types'
import type { Action } from '../../src/store/actions'
import { createAutosave, loadDraft, type DraftStorage } from '../../src/store/autosave'
import { createStore } from '../../src/store/store'

const logo = (over: Partial<Placement> = {}): Placement => ({
  id: 'p1',
  view: 2,
  content: { type: 'text', text: 'DWU', font: 'arimo', color: { hex: '#1f4e8c' } },
  x: 60,
  y: 100,
  scale: 1,
  rotation: 10,
  clip: true,
  ...over,
})

// A seeded generator, so a failure is reproducible.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

function randomAction(r: () => number, n: number): Action {
  const hex = `#${Math.floor(r() * 0xffffff).toString(16).padStart(6, '0')}`
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const choices: (() => Action)[] = [
    () => ({ type: 'setZoneColor', zone: pick(['cuff', 'leg', 'heel', 'toe', 'sole'] as const), color: { hex } }),
    () => ({ type: 'setZonePattern', zone: 'leg', pattern: r() < 0.5 ? null : { type: 'checks', color: { hex }, size: 8 } }),
    () => ({ type: 'setStripes', stripes: pick([0, 1, 2] as const) }),
    () => ({ type: 'setMidBand', on: r() < 0.5 }),
    () => ({ type: 'setViewLabel', index: pick([0, 1, 2, 3]), label: `L${n}` }),
    () => ({ type: 'addPlacement', placement: logo({ id: `a${n}` }), mirrorId: `m${n}` }),
    () => ({ type: 'updatePlacement', id: 'p1', patch: { x: r() * 200, y: r() * 400 } }),
    () => ({ type: 'setHeader', patch: { title: `Title ${n}` } }),
    () => ({ type: 'updateSpec', id: 'spec-0', patch: { value: `v${n}` } }),
    () => ({ type: 'moveSpec', id: 'spec-0', to: pick([0, 1, 2]) }),
  ]
  return pick(choices)()
}

const start = () => {
  const m = STYLE_PRESETS.crew.make()
  m.header.specs[0].id = 'spec-0'
  m.placements = [logo()]
  return m
}

describe('store + undo/redo', () => {
  it('20 random actions then 20 undos returns exactly to the original state', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const original = start()
      const snapshot = structuredClone(original)
      const store = createStore(original)
      const r = rng(seed)
      let steps = 0
      for (let i = 0; steps < 20; i++) {
        const before = store.get()
        store.dispatch(randomAction(r, i))
        if (store.get() !== before) steps++
      }
      for (let i = 0; i < 20; i++) store.undo()
      expect(store.get()).toBe(original) // same object, not just equal
      expect(store.get()).toEqual(snapshot) // and nothing was mutated along the way
      expect(store.canUndo()).toBe(false)
    }
  })

  it('redo replays undone steps; a new edit clears redo', () => {
    const store = createStore(start())
    store.dispatch({ type: 'setStripes', stripes: 2 })
    const two = store.get()
    store.undo()
    store.redo()
    expect(store.get()).toBe(two)
    store.undo()
    store.dispatch({ type: 'setMidBand', on: true })
    expect(store.canRedo()).toBe(false)
  })

  it('a drag is one undo step, however many moves it has', () => {
    const original = start()
    const store = createStore(original)
    store.beginGesture()
    for (let x = 0; x < 50; x++) store.dispatch({ type: 'updatePlacement', id: 'p1', patch: { x } })
    store.endGesture()
    expect(store.get().placements[0].x).toBe(49)
    store.undo()
    expect(store.get()).toBe(original)
  })

  it('a gesture with no change records nothing; no-op actions record nothing', () => {
    const store = createStore(start())
    store.beginGesture()
    store.endGesture()
    store.dispatch({ type: 'updatePlacement', id: 'missing', patch: { x: 1 } })
    expect(store.canUndo()).toBe(false)
  })

  it('notifies subscribers on every change, including undo', () => {
    const store = createStore(start())
    const fn = vi.fn()
    store.subscribe(fn)
    store.dispatch({ type: 'setStripes', stripes: 1 })
    store.undo()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('linked mirror copies', () => {
  const withCopy = () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'addPlacement', placement: logo(), mirrorId: 'p2' })
    return store
  }

  it('adding on Left creates the mirrored copy on Right in the same undo step', () => {
    const store = withCopy()
    const [a, b] = store.get().placements
    expect(b).toMatchObject({ id: 'p2', view: 3, x: 205, rotation: -10, mirrorOf: 'p1' })
    store.undo()
    expect(store.get().placements).toHaveLength(0)
    expect(a.id).toBe('p1')
  })

  it('no copy on a flat view', () => {
    const store = createStore(STYLE_PRESETS.crew.make())
    store.dispatch({ type: 'addPlacement', placement: logo({ view: 0 }), mirrorId: 'p2' })
    expect(store.get().placements).toHaveLength(1)
  })

  it('moving either copy moves the other', () => {
    const store = withCopy()
    store.dispatch({ type: 'updatePlacement', id: 'p1', patch: { x: 100, rotation: 20 } })
    expect(store.get().placements[1]).toMatchObject({ x: 165, rotation: -20, mirrorOf: 'p1' })
    store.dispatch({ type: 'updatePlacement', id: 'p2', patch: { x: 200, scale: 2 } })
    expect(store.get().placements[0]).toMatchObject({ x: 65, scale: 2 })
    expect(store.get().placements[0].mirrorOf).toBeUndefined()
  })

  it('unlink makes both independent; delete removes a linked pair', () => {
    let store = withCopy()
    store.dispatch({ type: 'unlinkPlacement', id: 'p2' })
    store.dispatch({ type: 'updatePlacement', id: 'p1', patch: { x: 10 } })
    expect(store.get().placements[1].x).toBe(205)
    store = withCopy()
    store.dispatch({ type: 'removePlacement', id: 'p2' })
    expect(store.get().placements).toHaveLength(0)
  })
})

describe('autosave', () => {
  const memory = (): DraftStorage & { data: Map<string, unknown> } => {
    const data = new Map<string, unknown>()
    return {
      data,
      get: async (k) => structuredClone(data.get(k)),
      set: async (k, v) => void data.set(k, structuredClone(v)),
    }
  }

  it('saves 1 s after the last edit, and the draft survives a "reload"', async () => {
    vi.useFakeTimers()
    const storage = memory()
    const status = vi.fn()
    const auto = createAutosave(storage, status, () => 1234)
    const m = start()
    auto.schedule(m)
    await vi.advanceTimersByTimeAsync(500)
    auto.schedule({ ...m, stripes: 2 }) // resets the timer
    await vi.advanceTimersByTimeAsync(900)
    expect(storage.data.size).toBe(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(status).toHaveBeenLastCalledWith(true)
    vi.useRealTimers()
    // "Reload": a fresh loader reading the same storage gets the exact mockup back.
    const draft = await loadDraft(storage)
    expect(draft).toEqual({ mockup: { ...m, stripes: 2 }, savedAt: 1234 })
  })

  it('reports a failed save, and recovers on the next good one', async () => {
    vi.useFakeTimers()
    let fail = true
    const status = vi.fn()
    const auto = createAutosave(
      { get: async () => undefined, set: async () => { if (fail) throw new Error('QuotaExceededError') } },
      status,
    )
    auto.schedule(start())
    await vi.advanceTimersByTimeAsync(1000)
    expect(status).toHaveBeenLastCalledWith(false)
    fail = false
    auto.schedule(start())
    await vi.advanceTimersByTimeAsync(1000)
    expect(status).toHaveBeenLastCalledWith(true)
    vi.useRealTimers()
  })

  it('a storage that never answers does not block opening', async () => {
    const draft = await loadDraft({ get: () => new Promise(() => {}), set: async () => {} }, 20)
    expect(draft).toBeNull()
  })

  it('a damaged or tampered draft is ignored, never half-loaded', async () => {
    const storage = memory()
    expect(await loadDraft(storage)).toBeNull()
    storage.data.set('draft', { mockup: { version: 1, template: 'crew' }, savedAt: 1 })
    expect(await loadDraft(storage)).toBeNull()
    storage.data.set('draft', 'garbage')
    expect(await loadDraft(storage)).toBeNull()
    let told = 0
    storage.data.set('draft', { mockup: { version: 1 }, savedAt: 5 })
    await loadDraft(storage, 100, () => told++)
    expect(told).toBe(1) // a damaged draft is reported, not silently dropped
    storage.data.delete('draft')
    await loadDraft(storage, 100, () => told++)
    expect(told).toBe(1) // no draft at all is not an error
  })
})
