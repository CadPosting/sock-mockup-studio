// Toasts (design brief B6): bottom centre, 3 s, for saved / exported / copied / errors.

import { h } from './dom'

const DURATION_MS = 3000

export function createToasts(parent: HTMLElement) {
  const box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })
  parent.append(box)
  return (message: string, kind: 'info' | 'error' = 'info') => {
    const t = h('div', { class: `toast toast--${kind}` }, message)
    box.append(t)
    setTimeout(() => t.remove(), DURATION_MS)
  }
}

export type Toast = ReturnType<typeof createToasts>
