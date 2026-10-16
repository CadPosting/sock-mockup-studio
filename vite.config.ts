import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// `vite preview` serves exactly the headers Vercel will (TDD §8), read from vercel.json, so the CSP
// is live in every preview and end-to-end run instead of only after deploying.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { headers: { key: string; value: string }[] }[]
}
const headers = Object.fromEntries(vercel.headers.flatMap((h) => h.headers).map((h) => [h.key, h.value]))

export default defineConfig({
  preview: { headers },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
  },
})
