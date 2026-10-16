import { CURRENT_VERSION } from './schema'
import type { ColorRef, Header, Mockup, SpecRow, TemplateId, ViewSlot } from './types'

export const WHITE: ColorRef = { hex: '#ffffff' }
export const BLACK: ColorRef = { hex: '#000000' }

export const VIEW_PRESETS = {
  'front-back': [
    { kind: 'front', label: 'Front' },
    { kind: 'back', label: 'Back' },
    { kind: 'left', label: 'Left' },
    { kind: 'right', label: 'Right' },
  ],
  'front-sole': [
    { kind: 'front', label: 'Front' },
    { kind: 'sole', label: 'Sole' },
    { kind: 'left', label: 'Left - outer' },
    { kind: 'right', label: 'Right - outer' },
  ],
} satisfies Record<string, [ViewSlot, ViewSlot, ViewSlot, ViewSlot]>

export type ViewPresetId = keyof typeof VIEW_PRESETS

let idCounter = 0
/** Short unique id. Collisions only matter within one mockup, so time + counter is enough. */
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`
}

function spec(label: string, value: string): SpecRow {
  return { id: newId('spec'), label, value, visible: true }
}

function allZones(color: ColorRef): Mockup['zones'] {
  return {
    cuff: color,
    stripe1: color,
    stripe2: color,
    leg: color,
    band: color,
    heel: color,
    foot: color,
    toe: color,
    sole: color,
  }
}

function baseHeader(overrides: Partial<Header>): Header {
  return {
    client: '',
    tag: { mode: 'sample', n: 1 },
    title: 'Specifications',
    titleBold: true,
    columns: 1,
    specs: [],
    palette: { show: false, rows: [] },
    ...overrides,
  }
}

function base(template: TemplateId, views: ViewPresetId, header: Header): Mockup {
  return {
    version: CURRENT_VERSION,
    template,
    pageColor: 'white',
    views: structuredClone(VIEW_PRESETS[views]) as Mockup['views'],
    zones: allZones(WHITE),
    stripes: 0,
    midBand: false,
    placements: [],
    patterns: { gripDots: null, motif: null },
    header,
    assets: {},
  }
}

const GRIP_DOTS = { style: 'solid', color: BLACK, spacing: 18, size: 4, onBack: false } as const

// Spec text below is copied from Peter's existing Keynote mockups (DWU, StFX, REWD, Nutrio, PYC).
export const STYLE_PRESETS = {
  crew: {
    name: 'Crew',
    make: (): Mockup =>
      base(
        'crew',
        'front-back',
        baseHeader({
          specs: [
            spec('', 'Crew - Fully cushioned footbed'),
            spec('', '80% cotton, 18% polyamide, 2% elastane'),
            spec('', '156N'),
          ],
        }),
      ),
  },
  'crew-grip': {
    name: 'Crew Grip',
    make: (): Mockup => ({
      ...base(
        'crew',
        'front-sole',
        baseHeader({
          title: 'Mockup - Crew Grip Socks - Key Specifications',
          titleBold: false,
          columns: 2,
          specs: [
            spec('Yarn composition', 'organic combed cotton, polyamide, elastane'),
            spec('Base yarn colour', 'white'),
            spec('Thread (logo) colour', 'black'),
            spec('Sizes', 'S/M/L (M for sample)'),
            spec('Knitting standard', '168N'),
            spec('Toe linking', 'seamless'),
            spec('Footbed', 'half terry cushioning'),
            spec('Sole grips', 'PVC'),
          ],
        }),
      ),
      patterns: { gripDots: { ...GRIP_DOTS }, motif: null },
    }),
  },
  'dress-crew': {
    name: 'Dress Crew',
    make: (): Mockup =>
      base(
        'crew',
        'front-back',
        baseHeader({
          tag: { mode: 'code', line1: 'HIP-CSC-05', line2: 'Dress Crew' },
          specs: [spec('', '80% cotton, 18% polyamide, 2% elastane'), spec('', '156N')],
        }),
      ),
  },
  'athletic-ankle': {
    name: 'Athletic Ankle',
    make: (): Mockup =>
      base(
        'ankle',
        'front-back',
        baseHeader({
          specs: [
            spec('', 'HIP1-CSC-02'),
            spec('', 'Athletic Ankle - Fully cushioned footbed'),
            spec('', '80% cotton, 18% polyamide, 2% elastane'),
            spec('', '156N'),
          ],
        }),
      ),
  },
  'ankle-tab-grip': {
    name: 'Ankle Tab Grip',
    make: (): Mockup => ({
      ...base(
        'ankle-tab',
        'front-back',
        baseHeader({
          title: 'Mockup - Ankle Tab Grip Socks - Key Specifications',
          titleBold: false,
          columns: 2,
          specs: [
            spec('Yarn composition', 'organic combed cotton, polyamide, elastane'),
            spec('Base yarn colour', 'white'),
            spec('Thread (logo) colour', 'black'),
            spec('Sizes', 'S/M/L (M for sample)'),
            spec('Knitting standard', '168N'),
            spec('Toe linking', 'seamless'),
            spec('Footbed', 'half terry cushioning'),
            spec('Internal heel grips', 'PVC'),
            spec('Sole', 'black PVC grip dots + logo'),
          ],
        }),
      ),
      patterns: { gripDots: { ...GRIP_DOTS, onBack: true }, motif: null },
    }),
  },
} satisfies Record<string, { name: string; make: () => Mockup }>

export type StylePresetId = keyof typeof STYLE_PRESETS
