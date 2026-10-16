import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS } from '../../src/model/defaults'
import type { Placement } from '../../src/model/types'
import { acrossProfiles, mirrored, rightFromLeftTransform } from '../../src/render/placements'
import { render } from '../../src/render/sheet'

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const wordmark = (over: Partial<Placement> = {}): Placement => ({
  id: 'p1',
  view: 2,
  content: { type: 'text', text: 'REWD', font: 'oswald', color: { hex: '#000000' } },
  x: 60,
  y: 120,
  scale: 1.5,
  rotation: 30,
  clip: true,
  ...over,
})

describe('mirror math', () => {
  it('flips position across the 265-wide profile slot and reverses rotation', () => {
    const copy = mirrored(wordmark(), 3, 'p2')
    expect(copy).toMatchObject({ id: 'p2', view: 3, x: 205, y: 120, rotation: -30, scale: 1.5, mirrorOf: 'p1' })
  })

  it('mirroring twice returns the original position', () => {
    const back = mirrored(mirrored(wordmark(), 3, 'p2'), 2, 'p3')
    expect([back.x, back.y, back.rotation]).toEqual([60, 120, 30])
  })

  it('does not share content objects with the original', () => {
    const p = wordmark()
    const copy = mirrored(p, 3, 'p2')
    ;(copy.content as { text: string }).text = 'changed'
    expect((p.content as { text: string }).text).toBe('REWD')
  })
})

describe('rendering placements', () => {
  it('text on the mirrored Right is not flipped: no scale() above it', () => {
    const m = STYLE_PRESETS.crew.make()
    m.placements = [wordmark(), mirrored(wordmark(), 3, 'p2')]
    const svg = render(m)
    let node: Element | null = svg.querySelector('[data-placement="p2"] text')
    expect(node!.textContent).toBe('REWD')
    for (; node; node = node.parentElement) expect(node.getAttribute('transform') ?? '').not.toContain('scale')
  })

  it('clipped placements use the clip and sit under the outline; unclipped go on top', () => {
    const m = STYLE_PRESETS.crew.make()
    m.placements = [wordmark(), wordmark({ id: 'free', clip: false })]
    const view = render(m).querySelector('[data-view="2"]')!
    const clipped = view.querySelector('[data-part="placements"]')!
    expect(clipped.getAttribute('clip-path')).toBe('url(#place-clip-2)')
    expect(clipped.querySelector('[data-placement="p1"]')).not.toBeNull()
    expect(view.lastElementChild!.querySelector('[data-placement="free"]')).not.toBeNull()
  })

  it('image placements are data-URL <image>s; text is never parsed as markup', () => {
    const m = STYLE_PRESETS.crew.make()
    m.assets.a = { name: 'logo.png', mime: 'image/png', dataUrl: PNG_1PX }
    m.placements = [
      { ...wordmark({ id: 'img' }), content: { type: 'image', assetId: 'a' } },
      wordmark({ id: 'txt', content: { type: 'text', text: '<script>x</script>', font: 'arimo', color: { hex: '#ff0000' } } }),
    ]
    const svg = render(m)
    expect(svg.querySelector('[data-placement="img"] image')!.getAttribute('href')).toBe(PNG_1PX)
    expect(svg.querySelector('script')).toBeNull()
    expect(svg.querySelector('[data-placement="txt"] text')!.textContent).toBe('<script>x</script>')
  })

  it('every editable text carries a data-field (for click-to-edit, task 13b)', () => {
    const m = STYLE_PRESETS['crew-grip'].make()
    m.placements = [wordmark()]
    const fields = [...render(m).querySelectorAll('[data-field]')].map((n) => n.getAttribute('data-field')!)
    expect(fields).toContain('title')
    expect(fields).toContain('tag:n')
    expect(fields).toContain('label:0')
    expect(fields).toContain('placement:p1')
    expect(fields.filter((f) => f.startsWith('spec:'))).toHaveLength(8)
  })
})

describe('ankle Left <-> Right mapping (fitted to the traced outlines)', () => {
  const p = wordmark({ x: 120, y: 200, rotation: 15, scale: 1.2 })

  it('Right -> Left undoes Left -> Right exactly (move either copy, the other stays put)', () => {
    const right = acrossProfiles('ankle', 'left', p, 3, 'p2')
    const back = acrossProfiles('ankle', 'right', right, 2, 'p1')
    expect(back.x).toBeCloseTo(p.x, 9)
    expect(back.y).toBeCloseTo(p.y, 9)
    expect(back.rotation).toBeCloseTo(p.rotation, 9)
    expect(back.scale).toBeCloseTo(p.scale, 9)
  })

  it("the copy is not a plain flip: it follows Peter's tilted Right", () => {
    const flip = mirrored(p, 3, 'p2')
    const mapped = acrossProfiles('ankle', 'left', p, 3, 'p2')
    expect(Math.hypot(mapped.x - flip.x, mapped.y - flip.y)).toBeGreaterThan(5)
    expect(mapped.rotation).not.toBeCloseTo(-15, 0)
  })

  it('crew has no map: a plain mirror, as before', () => {
    expect(acrossProfiles('crew', 'left', p, 3, 'p2')).toEqual(mirrored(p, 3, 'p2'))
  })

  it('the SVG matrix for Right extras maps points exactly like the logo copy does', () => {
    const [A, B, C, D, E, F] = rightFromLeftTransform('ankle')!.match(/-?[\d.e-]+/g)!.map(Number)
    for (const [x, y] of [[0, 0], [160, 45], [85, 303], [262, 194], [30, 400]]) {
      const viaCopy = acrossProfiles('ankle', 'left', wordmark({ x, y }), 3, 'c')
      expect(A * x + C * y + E).toBeCloseTo(viaCopy.x, 6)
      expect(B * x + D * y + F).toBeCloseTo(viaCopy.y, 6)
    }
  })
})
