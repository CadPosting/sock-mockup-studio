import type { z } from 'zod'
import type { FONT_IDS, mockupSchema, TEMPLATE_IDS, VIEW_KINDS, ZONE_IDS } from './schema'

export type Mockup = z.infer<typeof mockupSchema>
export type ZoneId = (typeof ZONE_IDS)[number]
export type TemplateId = (typeof TEMPLATE_IDS)[number]
export type ViewKind = (typeof VIEW_KINDS)[number]
export type FontId = (typeof FONT_IDS)[number]

export type ViewSlot = Mockup['views'][number]
export type ColorRef = Mockup['zones'][ZoneId]
export type Placement = Mockup['placements'][number]
export type PlacementContent = Placement['content']
export type GripDots = NonNullable<Mockup['patterns']['gripDots']>
export type Motif = NonNullable<Mockup['patterns']['motif']>
export type Header = Mockup['header']
export type SpecRow = Header['specs'][number]
export type Asset = Mockup['assets'][string]
export type ZoneFill = Mockup['zoneFills'][number]
export type ZonePattern = ZoneFill['pattern']
