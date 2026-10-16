// Logo upload checks (TDD §8). The file's own bytes decide its type, never its name or the
// browser's guess, so a renamed .exe is rejected. Uploaded SVGs are only ever shown through a
// data-URL <image>, where browsers don't run scripts, never inserted into the page as markup.

import type { Asset } from '../model/types'

export const MAX_LOGO_BYTES = 10 * 1024 * 1024

export const UPLOAD_ERRORS = {
  type: 'Only PNG, JPG or SVG logos.',
  size: 'Logo is over 10 MB. Export a smaller PNG and try again.',
} as const

export type LogoMime = Asset['mime']

/** Image type from the first bytes of the file, or null if it's none of the three we accept. */
export function sniffImageType(bytes: Uint8Array): LogoMime | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  // SVG is text: allow a BOM, whitespace, an XML declaration, comments or a doctype first,
  // and require a real <svg element near the start.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^﻿/, '')
  const svgStart = /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i
  if (svgStart.test(head)) return 'image/svg+xml'
  return null
}

export function toDataUrl(bytes: Uint8Array, mime: LogoMime): string {
  // btoa needs a binary string; build it in chunks so large files don't overflow the call stack.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(binary)}`
}

export type CheckedLogo = { ok: true; mime: LogoMime; dataUrl: string } | { ok: false; message: string }

/** Size and type checks; returns the data URL to store. */
export async function checkLogoFile(file: File): Promise<CheckedLogo> {
  if (file.size > MAX_LOGO_BYTES) return { ok: false, message: UPLOAD_ERRORS.size }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffImageType(bytes)
  if (!mime) return { ok: false, message: UPLOAD_ERRORS.type }
  return { ok: true, mime, dataUrl: toDataUrl(bytes, mime) }
}
