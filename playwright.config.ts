import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'
import { PG_TEST_URL } from './tests/e2e/pg-db'

const PORT = 5190
const PG_PORT = 5194
const BASE = '/mcgipro-operator-scheduler/'

// `npm run test:e2e:pg` sets E2E_PG=1: then only the "pg" project and its server run, against the
// throwaway `mcgi_board_test` database. Plain `npm run test:e2e` never needs PostgreSQL.
const PG = !!process.env.E2E_PG

type WebServer = Exclude<NonNullable<PlaywrightTestConfig['webServer']>, unknown[]>

const demoServer: WebServer = {
  // Empty Supabase env vars force the local demo backend (localStorage + BroadcastChannel),
  // overriding whatever is in .env, so tests never touch a real database.
  command: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port ${PORT} --strictPort`,
  url: `http://localhost:${PORT}${BASE}`,
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: 'ignore',
  stderr: 'pipe',
}

const pgServer: WebServer = {
  // Prepares mcgi_board_test (create + schema + truncate), then runs `vite --mode pg` with
  // DATABASE_URL overriding the .env.pg value (vite's loadEnv lets process.env win).
  command:
    `npx tsx tests/e2e/pg-setup.ts && DATABASE_URL=${PG_TEST_URL} VITE_BACKEND=postgres ` +
    `npx vite --mode pg --port ${PG_PORT} --strictPort`,
  url: `http://localhost:${PG_PORT}${BASE}`,
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: 'ignore',
  stderr: 'pipe',
}

const desktopUse = { browserName: 'chromium' as const, viewport: { width: 1440, height: 900 } }

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  // The two pg spec files share one database, so they run one at a time.
  workers: PG ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    // Headed by default so test runs are visible; CI stays headless.
    headless: !!process.env.CI,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: PG
    ? [
        {
          // All tests share one database, so the file runs in order on a single worker.
          name: 'pg',
          testMatch: /pg(-races)?\.spec\.ts$/,
          fullyParallel: false,
          use: { ...desktopUse, baseURL: `http://localhost:${PG_PORT}${BASE}` },
        },
      ]
    : [
        {
          name: 'desktop',
          grepInvert: /@mobile/,
          testIgnore: /pg(-races)?\.spec\.ts$/,
          use: {
            ...desktopUse,
            permissions: ['clipboard-read', 'clipboard-write'],
          },
        },
        {
          name: 'mobile',
          grepInvert: /@desktop/,
          testIgnore: /pg(-races)?\.spec\.ts$/,
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
  webServer: PG ? pgServer : demoServer,
})
