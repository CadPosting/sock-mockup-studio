// Dominant colours of a logo (TDD §5, PRD 5.5). About 40 lines, no library.

// 128 rather than TDD's 64: wide logos squashed to 64 px blur so much that soft edge colours
// outnumber the solid brand colour.
const SAMPLE_SIZE = 128
const MAX_COLORS = 5
/** Two colours closer than this (RGB distance) count as the same swatch. */
const MIN_DISTANCE = 60

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * From raw RGBA pixels: skip transparent, very light and near-black pixels (backgrounds, off-white
 * logo backgrounds and outlines; white and black are offered as basics anyway), bucket the rest
 * by 4 bits per channel, and keep the top buckets that are visibly different from each other. Each swatch is its bucket's
 * average colour, so it matches the logo rather than the bucket corner.
 */
export function extractPalette(rgba: Uint8ClampedArray | Uint8Array): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
    if (a < 128) continue
    if (r > 225 && g > 225 && b > 225) continue
    if (r < 20 && g < 20 && b < 20) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n++
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }
  // Rank by pixel count weighted by colourfulness (chroma). Thin lettering is mostly soft
  // anti-aliased edge pixels; without the weight those pale shades outrank the brand colour.
  const score = (k: { n: number; r: number; g: number; b: number }) => {
    const [r, g, b] = [k.r / k.n, k.g / k.n, k.b / k.n]
    return k.n * (0.25 + (Math.max(r, g, b) - Math.min(r, g, b)) / 255)
  }
  const ranked = [...buckets.values()].sort((x, y) => score(y) - score(x)).map((k) => [k.r / k.n, k.g / k.n, k.b / k.n])
  const kept: number[][] = []
  for (const c of ranked) {
    if (kept.every((k) => Math.hypot(k[0] - c[0], k[1] - c[1], k[2] - c[2]) >= MIN_DISTANCE)) kept.push(c)
    if (kept.length === MAX_COLORS) break
  }
  return kept.map(([r, g, b]) => toHex(r, g, b))
}

/**
 * Browser-only: load an image data URL, read its natural size, and extract its palette from a
 * 128x128 downscale. SVGs without an intrinsic size come back as 0x0 and are given a nominal size.
 */
export async function readImage(dataUrl: string): Promise<{ width: number; height: number; palette: string[] }> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const width = img.naturalWidth || 300
  const height = img.naturalHeight || 150
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { width, height, palette: [] }
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  return { width, height, palette: extractPalette(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data) }
}
