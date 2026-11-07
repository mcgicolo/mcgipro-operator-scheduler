import { defineConfig } from '@playwright/test'

const PORT = 5190

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/mcgipro-operator-scheduler/`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@mobile/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'mobile',
      grepInvert: /@desktop/,
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      },
    },
  ],
  webServer: {
    // Empty Supabase env vars force the local demo backend (localStorage + BroadcastChannel),
    // overriding whatever is in .env, so tests never touch a real database.
    command: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/mcgipro-operator-scheduler/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
