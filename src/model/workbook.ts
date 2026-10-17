// A file holds one or more sheets (tabs), each a full mockup. Version-1 files, which are a
// single mockup, still open: they become a workbook with one sheet.

import { cleanSvgAssets } from '../io/clean'
import { migrate, MockupFileError } from './schema'
import type { Mockup } from './types'

export const MAX_SHEETS = 50
export const MAX_SHEET_NAME = 40
export const MAX_FILE_NAME = 80
export const WORKBOOK_FORMAT = 'sockmockup-workbook'

export type SheetData = { name: string; mockup: Mockup }
/** `name` is the file name the user typed; empty means automatic (from the open sheet). */
export type WorkbookData = { sheets: SheetData[]; active: number; name?: string }

const DAMAGED = "This file isn't a Sock Mockup Studio file (or it's damaged)."

/** The name a sheet gets when nobody has named it: its SAMPLE number, else its position. */
export function defaultSheetName(m: Mockup, index: number): string {
  return m.header.tag.mode === 'sample' ? `SAMPLE ${m.header.tag.n}` : `Sheet ${index + 1}`
}

/** Trimmed, single-line, capped. Empty means "keep the old name" to the caller. */
export function cleanSheetName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_SHEET_NAME)
}

export function cleanFileName(name: string): string {
  return name.replace(/\.sockmockup\.json$|\.json$/i, '').replace(/\s+/g, ' ').trim().slice(0, MAX_FILE_NAME)
}

/** The workbook as it's stored: in a file (as JSON) and in the autosaved draft. */
export function workbookRecord(wb: WorkbookData) {
  return { format: WORKBOOK_FORMAT, version: 1, active: wb.active, sheets: wb.sheets, ...(wb.name ? { name: wb.name } : {}) }
}

export function serializeWorkbook(wb: WorkbookData): string {
  return JSON.stringify(workbookRecord(wb))
}

/**
 * Parsed JSON -> a valid workbook. Every sheet goes through the same migrate() and SVG cleaning
 * as a single mockup file, and one bad sheet rejects the whole file.
 */
export function readWorkbook(raw: unknown): WorkbookData {
  if (typeof raw !== 'object' || raw === null) throw new MockupFileError(DAMAGED)
  const r = raw as Record<string, unknown>
  if (r.format !== WORKBOOK_FORMAT) {
    const mockup = cleanSvgAssets(migrate(raw)) // a version-1 single-mockup file
    return { sheets: [{ name: defaultSheetName(mockup, 0), mockup }], active: 0 }
  }
  if (typeof r.version !== 'number' || r.version > 1) throw new MockupFileError('This file was made by a newer version of the tool.')
  const keys = Object.keys(r).filter((k) => k !== 'name').sort().join(',')
  if (keys !== 'active,format,sheets,version') throw new MockupFileError(DAMAGED)
  if ('name' in r && (typeof r.name !== 'string' || r.name.length > MAX_FILE_NAME)) throw new MockupFileError(DAMAGED)
  if (!Array.isArray(r.sheets) || r.sheets.length === 0 || r.sheets.length > MAX_SHEETS) throw new MockupFileError(DAMAGED)
  const sheets = r.sheets.map((s: unknown, i): SheetData => {
    if (typeof s !== 'object' || s === null || Object.keys(s).sort().join(',') !== 'mockup,name') throw new MockupFileError(DAMAGED)
    const { name, mockup } = s as { name: unknown; mockup: unknown }
    if (typeof name !== 'string' || name.length > MAX_SHEET_NAME) throw new MockupFileError(DAMAGED)
    const m = cleanSvgAssets(migrate(mockup))
    return { name: cleanSheetName(name) || defaultSheetName(m, i), mockup: m }
  })
  const active = r.active
  if (typeof active !== 'number' || !Number.isInteger(active) || active < 0 || active >= sheets.length) throw new MockupFileError(DAMAGED)
  const name = typeof r.name === 'string' ? cleanFileName(r.name) : ''
  return name ? { sheets, active, name } : { sheets, active }
}
