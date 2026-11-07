// Helpers for the Postgres-mode e2e suite (tests/e2e/pg.spec.ts).
// Everything here targets a dedicated throwaway database, never the developer's `mcgi_board`.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const PG_TEST_URL = process.env.PG_TEST_URL || 'postgres://localhost:5432/mcgi_board_test'

const dbName = new URL(PG_TEST_URL).pathname.slice(1)
// Guard: these helpers truncate tables, so refuse anything that isn't clearly a test database.
if (!/_test$/.test(dbName)) throw new Error(`Refusing to use "${dbName}" for e2e: database name must end in _test`)

/** Runs SQL against the test database and returns psql's unaligned, tuples-only output. */
export function psql(sql: string): string {
  return execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', PG_TEST_URL, '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '--client-min-messages=warning' },
  }).trim()
}

export interface DbRow {
  id: string
  operator_id: string
  schedule_id: string
  moved_by: string
  client_id: string
}

/** All assignment rows (as JSON, so no column-splitting surprises). */
export function dbRows(): DbRow[] {
  const out = psql(
    `select coalesce(json_agg(json_build_object('id', id, 'operator_id', operator_id, 'schedule_id', schedule_id,
       'moved_by', moved_by, 'client_id', client_id) order by moved_at), '[]') from assignments`,
  )
  return JSON.parse(out) as DbRow[]
}

export function truncate() {
  psql('truncate assignments, assignment_writes, assignment_events')
}

/** Creates the test database if needed, applies db/local-schema.sql (idempotent) and empties it. */
export function setupTestDb() {
  try {
    execFileSync('createdb', ['-h', 'localhost', '-p', new URL(PG_TEST_URL).port || '5432', dbName], { stdio: 'pipe' })
  } catch (e) {
    const msg = String((e as { stderr?: Buffer }).stderr ?? e)
    if (!/already exists/.test(msg)) throw new Error(`createdb ${dbName} failed: ${msg}`)
  }
  execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', PG_TEST_URL, '-f', join(root, 'db', 'local-schema.sql')], {
    stdio: 'pipe',
    env: { ...process.env, PGOPTIONS: '--client-min-messages=warning' },
  })
  truncate()
}
