// Autosave the open mockup to IndexedDB 1 s after the last edit (TDD §7). Storage is passed in,
// so tests use an in-memory fake and the app uses idb-keyval (localStorage caps out around
// 5 MB, and one embedded logo can blow that).

import { readWorkbook, workbookRecord, type WorkbookData } from '../model/workbook'

export type DraftStorage = {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

export type Draft = { workbook: WorkbookData; savedAt: number }

const KEY = 'draft'
export const AUTOSAVE_DELAY_MS = 1000

/**
 * Returns `schedule(m)` to call after every change. `onStatus(false)` means the last save failed
 * (quota, private window); the editor shows "Draft not autosaved — use Save" until a later
 * save succeeds and calls `onStatus(true)`.
 */
export function createAutosave(storage: DraftStorage, onStatus: (ok: boolean) => void, now = () => Date.now()) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: WorkbookData | undefined

  const flush = async () => {
    timer = undefined
    if (!latest) return
    try {
      await storage.set(KEY, { workbook: workbookRecord(latest), savedAt: now() })
      onStatus(true)
    } catch {
      onStatus(false) // the tool keeps working; the user can still Save to a file
    }
  }

  return {
    schedule(wb: WorkbookData) {
      latest = wb
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, AUTOSAVE_DELAY_MS)
    },
    /** Save right away (e.g. before the page is hidden). */
    flush,
  }
}

/**
 * The saved draft, or null if there is none or it doesn't validate. A draft goes through the
 * same migrate() as an opened file, so a damaged draft can never half-load.
 */
export async function loadDraft(
  storage: DraftStorage,
  timeoutMs = 1500,
  onDamaged: () => void = () => {},
): Promise<Draft | null> {
  try {
    // A blocked or stuck IndexedDB must never stop the editor from opening: give up after a
    // moment and start fresh (the draft is still there for next time).
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs))
    const raw = (await Promise.race([storage.get(KEY), timeout])) as { workbook?: unknown; mockup?: unknown; savedAt?: unknown } | undefined
    if (!raw) return null
    if (typeof raw.savedAt !== 'number') {
      onDamaged()
      return null
    }
    // Same pipeline as opening a file: validate, then clean any SVG logos. Drafts from before
    // sheet tabs hold a single mockup; readWorkbook turns that into one sheet.
    return { workbook: readWorkbook(raw.workbook ?? raw.mockup), savedAt: raw.savedAt }
  } catch {
    // A draft was there but didn't validate: tell the user rather than silently starting blank.
    onDamaged()
    return null
  }
}
