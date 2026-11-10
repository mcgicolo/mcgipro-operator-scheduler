// Postgres-mode e2e: `vite --mode pg` + server/pgDevApi.ts against the throwaway `mcgi_board_test`
// database. Run with `npm run test:e2e:pg` (needs a local PostgreSQL; see playwright.config.ts).
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'
import { chip, chips, confirmDialog, duty, mouseDrag, openBoard, operators, paletteNote, schedules, setNickname } from './helpers'
import { dbRows, psql, truncate } from './pg-db'

const [S1, S2, S3] = schedules
const opId = (name: string) => operators.find((o) => o.name === name)!.id
const ELIJ = 'Elij Cañaveral'
const VICTOR = 'Victor Toledo'
const ANDREI = 'Andrei Dacanay'
const API = 'api/assignments'

/** Opens the board in a fresh browser context (own localStorage → own client_id) and waits for "live". */
async function openLiveBoard(browser: Browser, info: TestInfo, nickname: string): Promise<Page> {
  const { baseURL, viewport } = info.project.use
  const context = await browser.newContext({ baseURL, viewport })
  await setNickname(context, nickname)
  const page = await context.newPage()
  await openBoard(page)
  await expect(page.locator('.navbar .status')).toHaveText('Live · local DB')
  return page
}

test.beforeEach(() => truncate())

test('status pill reads "Live · local DB"', async ({ browser }, info) => {
  const page = await openLiveBoard(browser, info, 'Pill')
  await expect(page.locator('.navbar .status')).toHaveText('Live · local DB')
  await page.context().close()
})

test('add in page A appears live in page B and is persisted in the test DB', async ({ browser, request }, info) => {
  const a = await openLiveBoard(browser, info, 'Alice')
  const b = await openLiveBoard(browser, info, 'Bob')

  await mouseDrag(a, paletteNote(a, ELIJ), duty(a, S1.id))
  await expect(chip(a, S1.id, ELIJ)).toHaveCount(1)
  await expect(chip(b, S1.id, ELIJ)).toHaveCount(1)

  await expect.poll(() => dbRows().length).toBe(1)
  const [row] = dbRows()
  expect(row).toMatchObject({ operator_id: opId(ELIJ), schedule_id: S1.id, moved_by: 'Alice' })

  // The REST API serves the same row.
  const res = await request.get(API)
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual([expect.objectContaining({ id: row.id, operator_id: opId(ELIJ), schedule_id: S1.id })])

  await a.context().close()
  await b.context().close()
})

test('duplicate drop is rejected (UI and API); still one row', async ({ browser, request }, info) => {
  const page = await openLiveBoard(browser, info, 'Dup')

  await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S1.id))
  await expect(chip(page, S1.id, ELIJ)).toHaveCount(1)
  await expect.poll(() => dbRows().length).toBe(1)

  await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S1.id))
  await expect(page.locator('.toast', { hasText: 'Already in this duty' })).toBeVisible()
  await expect(chips(page, S1.id)).toHaveCount(1)

  // The database's unique (operator_id, schedule_id) constraint backs it up: 409 from the API.
  const res = await request.post(API, {
    data: {
      id: randomUUID(),
      operator_id: opId(ELIJ),
      schedule_id: S1.id,
      moved_by: 'api',
      client_id: 'e2e-api',
      moved_at: new Date().toISOString(),
    },
  })
  expect(res.status()).toBe(409)
  expect(await res.json()).toMatchObject({ code: 'duplicate' })

  expect(dbRows()).toHaveLength(1)
  await expect(chips(page, S1.id)).toHaveCount(1)
  await page.context().close()
})

test('move persists to the DB and shows in the other page', async ({ browser }, info) => {
  const a = await openLiveBoard(browser, info, 'Mover')
  const b = await openLiveBoard(browser, info, 'Watcher')

  await mouseDrag(a, paletteNote(a, VICTOR), duty(a, S2.id))
  await expect(chip(b, S2.id, VICTOR)).toHaveCount(1)
  await expect.poll(() => dbRows().length).toBe(1)
  const id = dbRows()[0].id

  await mouseDrag(a, chip(a, S2.id, VICTOR), duty(a, S3.id))
  await expect(chip(a, S3.id, VICTOR)).toHaveCount(1)
  await expect(chips(a, S2.id)).toHaveCount(0)
  await expect(chip(b, S3.id, VICTOR)).toHaveCount(1)
  await expect(chips(b, S2.id)).toHaveCount(0)

  await expect.poll(() => dbRows().map((r) => [r.id, r.schedule_id])).toEqual([[id, S3.id]])
  expect(psql(`select moved_by_email from assignments where id = '${id}'`)).toBe('e2e@example.com')
  expect(psql("select actor_email from assignment_events where action = 'move'")).toBe('e2e@example.com')

  await a.context().close()
  await b.context().close()
})

test('remove via ✕ + confirm deletes the row', async ({ browser }, info) => {
  const a = await openLiveBoard(browser, info, 'Remover')
  const b = await openLiveBoard(browser, info, 'Watcher')

  await mouseDrag(a, paletteNote(a, ANDREI), duty(a, S1.id))
  const placed = chip(a, S1.id, ANDREI)
  await expect(placed).toHaveCount(1)
  await expect(chip(b, S1.id, ANDREI)).toHaveCount(1)
  await expect.poll(() => dbRows().length).toBe(1)

  await placed.hover()
  await placed.locator('.remove').click()
  await expect(confirmDialog(a).locator('#cr-title')).toHaveText(`Remove ${ANDREI}?`)
  await confirmDialog(a).locator('.action.destructive').click()
  await expect(placed).toHaveCount(0)

  await expect.poll(() => dbRows().length).toBe(0)
  await expect(chip(b, S1.id, ANDREI)).toHaveCount(0)
  // The paper trail records the work email for the add and the remove (via remove_assignment).
  expect(psql('select action, actor, actor_email from assignment_events order by id')).toBe(
    'add|Remover|e2e@example.com\nremove|Remover|e2e@example.com',
  )

  await a.context().close()
  await b.context().close()
})

test('a row inserted directly with psql appears live; update and delete too', async ({ browser }, info) => {
  const page = await openLiveBoard(browser, info, 'Viewer')
  await expect(page.locator('.duty .v-chip')).toHaveCount(0)

  const id = randomUUID()
  psql(
    `insert into assignments (id, operator_id, schedule_id, moved_by, client_id)
     values ('${id}', '${opId(VICTOR)}', '${S2.id}', 'psql', 'psql')`,
  )
  await expect(chip(page, S2.id, VICTOR)).toHaveCount(1)

  psql(`update assignments set schedule_id = '${S3.id}' where id = '${id}'`)
  await expect(chip(page, S3.id, VICTOR)).toHaveCount(1)
  await expect(chips(page, S2.id)).toHaveCount(0)

  psql(`delete from assignments where id = '${id}'`)
  await expect(page.locator('.duty .v-chip')).toHaveCount(0)

  await page.context().close()
})

test('reload shows persisted state', async ({ browser }, info) => {
  const page = await openLiveBoard(browser, info, 'Reloader')

  await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S1.id))
  await mouseDrag(page, paletteNote(page, VICTOR), duty(page, S2.id))
  await expect(page.locator('.duty .v-chip')).toHaveCount(2)
  await expect.poll(() => dbRows().length).toBe(2)

  // A change made while the page is away is also picked up.
  psql(
    `insert into assignments (operator_id, schedule_id, moved_by, client_id)
     values ('${opId(ANDREI)}', '${S3.id}', 'psql', 'psql')`,
  )

  await page.reload()
  await expect(page.locator('aside.palette .v-palette')).toHaveCount(operators.length)
  await expect(page.locator('.navbar .status')).toHaveText('Live · local DB')
  await expect(chip(page, S1.id, ELIJ)).toHaveCount(1)
  await expect(chip(page, S2.id, VICTOR)).toHaveCount(1)
  await expect(chip(page, S3.id, ANDREI)).toHaveCount(1)
  await expect(page.locator('.duty .v-chip')).toHaveCount(3)

  // A brand-new visitor sees the same board.
  const fresh = await openLiveBoard(browser, info, 'Newcomer')
  await expect(fresh.locator('.duty .v-chip')).toHaveCount(3)

  await page.context().close()
  await fresh.context().close()
})
