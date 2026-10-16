import { defineConfig } from '@playwright/test'

// End-to-end tests for PRD A1-A3 (engineering-plan task 19). They run in the installed Google
// Chrome (channel: 'chrome'), against the production build served by `vite preview` on its own
// port so nothing else on the machine is reused by accident.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4180',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4180 --strictPort',
    port: 4180,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
