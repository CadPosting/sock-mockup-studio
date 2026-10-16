import { z } from 'zod'

// The schema is the single source of truth: types.ts derives every type from it,
// so the file validator and the app's types can never disagree.

export const CURRENT_VERSION = 1

const MAX_DATA_URL_LENGTH = 14_000_000 // ~10 MB file once base64-encoded

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour must be #rrggbb')
const shortText = z.string().max(200)

export const colorRefSchema = z.object({
  hex,
  ref: shortText.optional(), // free-text factory reference: Pantone TCX or yarn code like MRS001
})

export const ZONE_IDS = ['cuff', 'stripe1', 'stripe2', 'leg', 'band', 'heel', 'foot', 'toe', 'sole'] as const

export const TEMPLATE_IDS = ['crew', 'ankle', 'ankle-tab'] as const
export const VIEW_KINDS = ['front', 'back', 'sole', 'left', 'right'] as const
export const FONT_IDS = ['arimo', 'oswald', 'baskerville'] as const

const viewSlotSchema = z.object({
  kind: z.enum(VIEW_KINDS),
  label: shortText,
})

const contentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('image'), assetId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('text'),
    text: shortText,
    font: z.enum(FONT_IDS),
    color: colorRefSchema,
  }),
])

const placementSchema = z.object({
  id: z.string().min(1).max(64),
  view: z.number().int().min(0).max(3),
  content: contentSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  scale: z.number().positive().max(20),
  rotation: z.number().finite(),
  clip: z.boolean(),
  mirrorOf: z.string().max(64).optional(),
})

const gripDotsSchema = z.object({
  style: z.enum(['solid', 'outline']),
  color: colorRefSchema,
  spacing: z.number().min(4).max(60),
  size: z.number().min(1).max(30),
  onBack: z.boolean(), // also draw dots on the lower back view (REWD / PYC style)
})

const motifSchema = z.object({
  content: contentSchema,
  views: z.array(z.number().int().min(0).max(3)).max(4),
  size: z.number().min(5).max(200),
  spacing: z.number().min(10).max(300),
})

// Pattern fill for a zone. The zone's own colour is the base; these colours go on top.
export const PATTERN_TYPES = ['stripes', 'checks', 'dots', 'chevrons', 'camo', 'argyle'] as const
const zonePatternSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stripes'),
    color: colorRefSchema,
    width: z.number().min(2).max(80),
    gap: z.number().min(2).max(80),
    angle: z.number().min(-90).max(90), // 0 = horizontal bands
  }),
  z.object({ type: z.literal('checks'), color: colorRefSchema, size: z.number().min(4).max(80) }),
  z.object({
    type: z.literal('dots'),
    color: colorRefSchema,
    size: z.number().min(1).max(30),
    spacing: z.number().min(4).max(60),
    style: z.enum(['solid', 'outline']),
  }),
  z.object({ type: z.literal('chevrons'), color: colorRefSchema, size: z.number().min(6).max(80) }),
  z.object({ type: z.literal('camo'), colors: z.array(colorRefSchema).min(1).max(3), size: z.number().min(20).max(200) }),
  z.object({
    type: z.literal('argyle'),
    color: colorRefSchema, // diamond colour (alternates with the zone colour)
    line: colorRefSchema, // thin diagonal overcheck lines
    size: z.number().min(10).max(150), // diamond width
  }),
])

const zoneFillSchema = z.object({ zone: z.enum(ZONE_IDS), pattern: zonePatternSchema })

// Only the three image types we accept on upload, and only as base64 data URLs.
const assetSchema = z
  .object({
    name: shortText,
    mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
    dataUrl: z.string().max(MAX_DATA_URL_LENGTH),
    // Read once at upload: natural size (places the SAMPLE tag under the logo) and the logo's
    // main colours (offered first in every swatch row, PRD 5.5).
    width: z.number().int().min(1).max(20000).optional(),
    height: z.number().int().min(1).max(20000).optional(),
    palette: z.array(hex).max(8).optional(),
  })
  .refine((a) => a.dataUrl.startsWith(`data:${a.mime};base64,`), {
    message: 'asset data does not match its declared image type',
  })

const specRowSchema = z.object({
  id: z.string().min(1).max(64),
  label: shortText, // empty label = value printed on its own (DWU style)
  value: z.string().max(500),
  visible: z.boolean(),
})

const tagSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('sample'), n: z.number().int().min(1).max(999) }),
  z.object({ mode: z.literal('code'), line1: shortText, line2: shortText }),
])

const paletteRowSchema = z.object({
  name: shortText,
  hex,
  cmyk: shortText, // typed over from the client's brand guide when available
})

const headerSchema = z.object({
  client: shortText,
  logoAssetId: z.string().max(64).optional(),
  tag: tagSchema,
  title: shortText,
  titleBold: z.boolean(),
  columns: z.union([z.literal(1), z.literal(2)]),
  specs: z.array(specRowSchema).max(40),
  palette: z.object({ show: z.boolean(), rows: z.array(paletteRowSchema).max(8) }),
})

export const mockupSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  template: z.enum(TEMPLATE_IDS),
  pageColor: z.enum(['white', 'grey']),
  views: z.tuple([viewSlotSchema, viewSlotSchema, viewSlotSchema, viewSlotSchema]),
  // Explicit object (not z.record) so every zone is required, not Partial.
  zones: z.object({
    cuff: colorRefSchema,
    stripe1: colorRefSchema,
    stripe2: colorRefSchema,
    leg: colorRefSchema,
    band: colorRefSchema,
    heel: colorRefSchema,
    foot: colorRefSchema,
    toe: colorRefSchema,
    sole: colorRefSchema,
  }),
  stripes: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  midBand: z.boolean(),
  placements: z.array(placementSchema).max(100),
  patterns: z.object({ gripDots: gripDotsSchema.nullable(), motif: motifSchema.nullable() }),
  // At most one pattern per zone; zones without an entry are flat colour.
  zoneFills: z
    .array(zoneFillSchema)
    .max(ZONE_IDS.length)
    .refine((fills) => new Set(fills.map((f) => f.zone)).size === fills.length, 'one pattern per zone'),
  header: headerSchema,
  assets: z.record(z.string().max(64), assetSchema),
})

export class MockupFileError extends Error {}

/**
 * Turn parsed JSON from a .sockmockup.json file into a valid Mockup.
 * Older versions get upgraded here; anything invalid is rejected whole,
 * so a bad file can never half-load over the current mockup.
 */
export function migrate(raw: unknown): z.infer<typeof mockupSchema> {
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) {
    throw new MockupFileError("This file isn't a Sock Mockup Studio file (or it's damaged).")
  }
  const version = (raw as { version: unknown }).version
  if (typeof version !== 'number' || version > CURRENT_VERSION) {
    throw new MockupFileError('This file was made by a newer version of the tool.')
  }
  // No older versions exist yet. Future upgrades go here: `if (version === 1) raw = v1to2(raw)`.

  const result = mockupSchema.safeParse(raw)
  if (!result.success) {
    throw new MockupFileError("This file isn't a Sock Mockup Studio file (or it's damaged).")
  }
  const mockup = result.data

  // Cross-references the schema can't check on its own.
  const assetIds = new Set(Object.keys(mockup.assets))
  const refs = [
    mockup.header.logoAssetId,
    ...mockup.placements.map((p) => (p.content.type === 'image' ? p.content.assetId : undefined)),
    mockup.patterns.motif?.content.type === 'image' ? mockup.patterns.motif.content.assetId : undefined,
  ]
  if (refs.some((id) => id !== undefined && !assetIds.has(id))) {
    throw new MockupFileError("This file isn't a Sock Mockup Studio file (or it's damaged).")
  }
  return mockup
}
