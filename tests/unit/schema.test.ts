import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS } from '../../src/model/defaults'
import { migrate, MockupFileError } from '../../src/model/schema'

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const fresh = () => STYLE_PRESETS.crew.make()

describe('style presets', () => {
  for (const [id, preset] of Object.entries(STYLE_PRESETS)) {
    it(`${id} is a valid mockup`, () => {
      expect(() => migrate(preset.make())).not.toThrow()
    })
  }

  it('survives a JSON round-trip unchanged', () => {
    const m = STYLE_PRESETS['crew-grip'].make()
    expect(migrate(JSON.parse(JSON.stringify(m)))).toEqual(m)
  })
})

describe('migrate rejects bad files', () => {
  const rejects = (raw: unknown) => expect(() => migrate(raw)).toThrow(MockupFileError)

  it('non-objects', () => {
    rejects(null)
    rejects('hello')
    rejects([1, 2])
  })

  it('a newer version', () => rejects({ ...fresh(), version: 99 }))

  it('a missing zone', () => {
    const m = fresh() as { zones: Record<string, unknown> }
    delete m.zones.heel
    rejects(m)
  })

  it('a bad colour', () => rejects({ ...fresh(), zones: { ...fresh().zones, leg: { hex: 'red' } } }))

  it('an asset whose data is not the declared image type', () => {
    rejects({
      ...fresh(),
      assets: { a: { name: 'x.png', mime: 'image/png', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' } },
    })
  })

  it('a placement pointing at a missing asset', () => {
    const m = fresh()
    m.placements.push({
      id: 'p1',
      view: 0,
      content: { type: 'image', assetId: 'nope' },
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      clip: true,
    })
    rejects(m)
  })

  it('accepts a valid asset reference', () => {
    const m = fresh()
    m.assets.logo = { name: 'logo.png', mime: 'image/png', dataUrl: PNG_1PX }
    m.header.logoAssetId = 'logo'
    expect(() => migrate(m)).not.toThrow()
  })
})
