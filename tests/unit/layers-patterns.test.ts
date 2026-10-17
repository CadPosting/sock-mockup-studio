import { expect, it } from 'vitest'
import { renderLayers } from '../../src/editor/layers'
import { STYLE_PRESETS } from '../../src/model/defaults'

it('zone patterns show under Patterns, one row per look, naming their zones', () => {
  const m = STYLE_PRESETS['dress-crew'].make()
  const argyle = { type: 'argyle' as const, color: { hex: '#0077ae' }, line: { hex: '#a7a9ac' }, size: 40 }
  m.zoneFills = (['leg', 'foot'] as const).map((zone) => ({ zone, pattern: argyle }))
  const rows = [...renderLayers(m, null).querySelectorAll('.layers__section')].find((s) => s.textContent!.startsWith('Patterns'))!
  const r = rows.querySelector<HTMLElement>('[data-select="zone:leg"]')!
  expect(r.textContent).toContain('Argyle')
  expect(r.textContent).toContain('Leg, Foot')
  expect(rows.querySelectorAll('[data-select]').length).toBe(1)
})
