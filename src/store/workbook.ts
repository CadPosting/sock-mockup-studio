// Sheet tabs. The open sheet lives in the store (so every edit, undo and gesture works as
// before); the others are parked here as store snapshots, each with its own undo history.

import { newId } from '../model/defaults'
import { cleanSheetName, MAX_SHEETS, type SheetData, type WorkbookData } from '../model/workbook'
import type { Store, StoreSnapshot } from './store'

type Sheet = { id: string; name: string; snap: StoreSnapshot | null } // snap is null for the open sheet

export type Workbook = ReturnType<typeof createWorkbook>

export function createWorkbook(store: Store, firstName: string) {
  let sheets: Sheet[] = [{ id: newId('sheet'), name: firstName, snap: null }]
  let activeId = sheets[0].id
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((fn) => fn())
  const index = (id: string) => sheets.findIndex((s) => s.id === id)

  function park() {
    sheets[index(activeId)].snap = store.snapshot()
  }
  function open(id: string) {
    const target = sheets[index(id)]
    activeId = id
    const snap = target.snap!
    target.snap = null
    store.restore(snap)
  }

  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    list: () => sheets.map((s) => ({ id: s.id, name: s.name, active: s.id === activeId })),
    activeId: () => activeId,
    canAdd: () => sheets.length < MAX_SHEETS,

    switchTo(id: string) {
      if (id === activeId || index(id) < 0) return
      park()
      open(id)
      emit()
    },

    /** Add a sheet right after the open one and switch to it (fresh undo history). */
    add(sheet: SheetData): boolean {
      if (sheets.length >= MAX_SHEETS) return false
      park()
      const s: Sheet = { id: newId('sheet'), name: cleanSheetName(sheet.name) || 'Sheet', snap: { state: sheet.mockup, past: [], future: [] } }
      sheets.splice(index(activeId) + 1, 0, s)
      open(s.id)
      emit()
      return true
    },

    rename(id: string, name: string) {
      const s = sheets[index(id)]
      const clean = cleanSheetName(name)
      if (!s || !clean || clean === s.name) return
      s.name = clean
      emit()
    },

    /** Delete a sheet (never the last one). Deleting the open one opens its neighbour. */
    remove(id: string) {
      const i = index(id)
      if (i < 0 || sheets.length === 1) return
      if (id === activeId) {
        const next = sheets[i + 1] ?? sheets[i - 1]
        sheets.splice(i, 1)
        open(next.id)
      } else sheets.splice(i, 1)
      emit()
    },

    /** Every sheet as saved data, the open one taken live from the store. */
    data(): WorkbookData {
      return {
        sheets: sheets.map((s) => ({ name: s.name, mockup: s.snap ? s.snap.state : store.get() })),
        active: index(activeId),
      }
    },

    /** Replace all sheets (open file, new mockup, resume draft). Every sheet starts a fresh history. */
    load(wb: WorkbookData) {
      sheets = wb.sheets.map((s) => ({ id: newId('sheet'), name: s.name, snap: { state: s.mockup, past: [], future: [] } }))
      activeId = sheets[Math.min(wb.active, sheets.length - 1)].id
      const target = sheets[index(activeId)]
      target.snap = null
      store.load(wb.sheets[index(activeId)].mockup)
      emit()
    },

    /** Identity of what's saved: sheet names plus each sheet's state object (edits make new ones). */
    signature(): unknown[] {
      return sheets.flatMap((s) => [s.name, s.snap ? s.snap.state : store.get()])
    },
  }
}
