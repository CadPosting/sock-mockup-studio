// Sheet tabs under the sheet, like a spreadsheet: click a tab to open that sheet, double-click
// its name to rename it, "+" adds a copy of the open sheet as the next SAMPLE.

import { MAX_SHEET_NAME } from '../model/workbook'
import type { Workbook } from '../store/workbook'
import { h } from './dom'

export type SheetTabsOptions = {
  /** Finish edits and drags on the open sheet before another one replaces it. */
  beforeSwitch: () => void
  duplicate: () => void
  /** Inline confirmation (no browser popups): show `text`, run `go` on yes. */
  confirm: (text: string, yesLabel: string, go: () => void) => void
}

export function createSheetTabs(workbook: Workbook, o: SheetTabsOptions) {
  const list = h('div', { class: 'sheet-tabs__list', role: 'tablist', 'aria-label': 'Sheets' })
  const add = h('button', { type: 'button', class: 'sheet-tabs__add', title: 'New sheet: a copy of this one as the next SAMPLE', 'aria-label': 'New sheet' }, '+')
  add.addEventListener('click', () => o.duplicate())
  const root = h('nav', { class: 'sheet-tabs' }, list, add)

  function rename(id: string, label: HTMLElement) {
    const old = workbook.list().find((t) => t.id === id)!.name
    const input = h('input', { class: 'sheet-tab__input', type: 'text', value: old, maxlength: String(MAX_SHEET_NAME), 'aria-label': 'Sheet name', spellcheck: 'false' })
    let done = false
    const finish = (keep: boolean) => {
      if (done) return
      done = true
      if (keep) workbook.rename(id, input.value) // an empty name keeps the old one
      draw()
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation() // typing a name must not trigger editor shortcuts
      if (e.key === 'Enter') finish(true)
      if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => finish(true))
    label.replaceWith(input)
    input.focus()
    input.select()
  }

  function draw() {
    const tabs = workbook.list()
    list.replaceChildren(
      ...tabs.map((t) => {
        const label = h('span', { class: 'sheet-tab__name' }, t.name)
        const tab = h(
          'div',
          { class: t.active ? 'sheet-tab sheet-tab--active' : 'sheet-tab', role: 'tab', tabindex: '0', 'aria-selected': String(t.active), 'data-sheet': t.id, title: 'Double-click to rename' },
          label,
        )
        tab.addEventListener('click', (e) => {
          if ((e.target as Element).closest('.sheet-tab__input, .sheet-tab__close')) return
          if (t.active) return
          o.beforeSwitch()
          workbook.switchTo(t.id)
        })
        tab.addEventListener('dblclick', (e) => {
          if ((e.target as Element).closest('.sheet-tab__close, .sheet-tab__input')) return
          rename(t.id, label)
        })
        tab.addEventListener('keydown', (e) => {
          if (e.target !== tab) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!t.active) {
              o.beforeSwitch()
              workbook.switchTo(t.id)
            }
          }
          if (e.key === 'F2') rename(t.id, label)
        })
        if (t.active && tabs.length > 1) {
          const close = h('button', { type: 'button', class: 'sheet-tab__close', title: `Delete ${t.name}`, 'aria-label': `Delete ${t.name}` }, '×')
          close.addEventListener('click', () => deleteActive())
          tab.append(close)
        }
        return tab
      }),
    )
    add.disabled = !workbook.canAdd()
  }

  /** Delete the open sheet, after asking (never the last one). */
  function deleteActive(): boolean {
    const t = workbook.list().find((x) => x.active)!
    if (workbook.list().length === 1) return false
    o.confirm(`Delete ${t.name}? This can't be undone.`, 'Delete', () => {
      o.beforeSwitch()
      workbook.remove(t.id)
    })
    return true
  }

  /** Start renaming the open sheet's tab in place. */
  function renameActive() {
    const tab = list.querySelector<HTMLElement>('.sheet-tab--active')
    const label = tab?.querySelector<HTMLElement>('.sheet-tab__name')
    if (tab && label) rename(tab.dataset.sheet!, label)
  }

  draw()
  return { root, draw, renameActive, deleteActive }
}
