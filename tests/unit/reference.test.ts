// Render snapshots of the reference mockups (engineering-plan task 18, PRD A4).
// The fixtures are Peter's six real client mockups rebuilt in the tool. They contain client names
// and logos, so they live in tests/fixtures/reference/ (gitignored, local only); without that
// folder this test skips. Rebuild them with: npx vite-node tests/fixtures/reference/build.ts
import { describe, expect, it } from 'vitest'
import { migrate } from '../../src/model/schema'
import { render } from '../../src/render/sheet'

// Vite's glob import: finds whatever fixture files exist, and nothing if the folder is missing.
const files = import.meta.glob<string>('../fixtures/reference/*.sockmockup.json', { query: '?raw', import: 'default', eager: true })
const names = Object.keys(files).sort()

describe.skipIf(names.length === 0)('reference mockups (local fixtures)', () => {
  for (const path of names) {
    const name = path.split('/').pop()!.replace('.sockmockup.json', '')
    it(`${name}: opens as a valid file and renders the same as its snapshot`, async () => {
      const m = migrate(JSON.parse(files[path]))
      await expect(render(m).outerHTML).toMatchFileSnapshot(`../fixtures/reference/__snapshots__/${name}.svg`)
    })
  }
})
