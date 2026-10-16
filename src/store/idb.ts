import { get, set } from 'idb-keyval'
import type { DraftStorage } from './autosave'

/** The browser's IndexedDB, via idb-keyval. Used by the app; tests use an in-memory fake. */
export const idbStorage: DraftStorage = { get, set }
