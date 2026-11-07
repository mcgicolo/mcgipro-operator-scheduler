// Run by the pg webServer command (playwright.config.ts) before Vite starts, so the
// dev API's pool + LISTEN connection find a ready `mcgi_board_test` database.
import { PG_TEST_URL, setupTestDb } from './pg-db'

setupTestDb()
console.log(`✓ e2e database ready: ${new URL(PG_TEST_URL).pathname.slice(1)}`)
