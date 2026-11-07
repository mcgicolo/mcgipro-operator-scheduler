// Postgres-mode e2e: realtime races between an optimistic save that is still in flight and a
// change made by another device to the same sticky. Runs in the `pg` project (npm run test:e2e:pg).
import { expect, test, type Browser, type Page, type Route, type TestInfo } from '@playwright/test'
import { chip, chips, confirmDialog, duty, mouseDrag, openBoard, paletteNote, schedules, setNickname } from './helpers'
import { dbRows, truncate } from './pg-db'

// Needs the pg dev server + test database; the demo projects must not run it.
test.skip(!process.env.E2E_PG, 'Postgres-mode only: run with `npm run test:e2e:pg`')

const [S1, S2, S3] = schedules
const ELIJ = 'Elij Cañaveral'
const VICTOR = 'Victor Toledo'
const LIVE = 'Live · local DB'

async function openLiveBoard(browser: Browser, info: TestInfo, nickname: string): Promise<Page> {
  const { baseURL, viewport } = info.project.use
  const context = await browser.newContext({ baseURL, viewport })
  await setNickname(context, nickname)
  const page = await context.newPage()
  await openBoard(page)
  await expect(page.locator('.navbar .status')).toHaveText(LIVE)
  return page
}

/** Holds `page`'s PATCH requests until the returned `release()` is called (a slow phone network). */
async function holdPatches(page: Page, mode: 'before-server' | 'after-server') {
  let release!: () => void
  const released = new Promise<void>((r) => (release = r))
  await page.route('**/api/assignments/*', async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    if (mode === 'before-server') {
      await released
      return route.continue()
    }
    const response = await route.fetch() // reaches the server now; only the reply is late
    await released
    return route.fulfill({ response })
  })
  return release
}

test.beforeEach(() => truncate())

test('a sticky deleted elsewhere while my move is in flight does not come back', async ({ browser }, info) => {
  const a = await openLiveBoard(browser, info, 'SlowMover')
  const b = await openLiveBoard(browser, info, 'Remover')

  await mouseDrag(a, paletteNote(a, ELIJ), duty(a, S1.id))
  await expect(chip(b, S1.id, ELIJ)).toHaveCount(1)
  await expect.poll(() => dbRows().length).toBe(1)

  // A moves S1 → S2, but its PATCH is stuck on the network.
  const release = await holdPatches(a, 'before-server')
  await mouseDrag(a, chip(a, S1.id, ELIJ), duty(a, S2.id))
  await expect(chip(a, S2.id, ELIJ)).toHaveCount(1) // optimistic

  // Meanwhile B removes the sticky; the delete event reaches A while A's move is pending.
  const placed = chip(b, S1.id, ELIJ)
  await placed.hover()
  await placed.locator('.remove').click()
  await confirmDialog(b).locator('.action.destructive').click()
  await expect.poll(() => dbRows().length).toBe(0)
  await a.waitForTimeout(300)

  // A's move now lands on a deleted row (404): the sticky must disappear, not be restored.
  release()
  await expect(a.locator('.toast', { hasText: 'already removed' })).toBeVisible()
  await expect(a.locator('.duty .v-chip')).toHaveCount(0, { timeout: 2_000 })
  await expect(b.locator('.duty .v-chip')).toHaveCount(0)
  expect(dbRows()).toHaveLength(0)

  await a.context().close()
  await b.context().close()
})

test('a later move from another device wins over my slow-to-confirm move', async ({ browser }, info) => {
  const a = await openLiveBoard(browser, info, 'SlowMover')
  const b = await openLiveBoard(browser, info, 'FastMover')

  await mouseDrag(a, paletteNote(a, VICTOR), duty(a, S1.id))
  await expect(chip(b, S1.id, VICTOR)).toHaveCount(1)
  await expect.poll(() => dbRows().length).toBe(1)

  // A moves S1 → S2: the server applies it, but the reply to A is slow.
  const release = await holdPatches(a, 'after-server')
  await mouseDrag(a, chip(a, S1.id, VICTOR), duty(a, S2.id))
  await expect.poll(() => dbRows()[0]?.schedule_id).toBe(S2.id)

  // B then moves it S2 → S3; A receives that event while its own save is still pending.
  await expect(chip(b, S2.id, VICTOR)).toHaveCount(1)
  await mouseDrag(b, chip(b, S2.id, VICTOR), duty(b, S3.id))
  await expect.poll(() => dbRows()[0]?.schedule_id).toBe(S3.id)
  await a.waitForTimeout(300)

  // When A's save settles, A must converge on the database (S3), not keep its own S2.
  release()
  await expect(chip(a, S3.id, VICTOR)).toHaveCount(1, { timeout: 2_000 })
  await expect(chips(a, S2.id)).toHaveCount(0)
  await expect(chip(b, S3.id, VICTOR)).toHaveCount(1)
  await expect(a.locator('.toast', { hasText: 'Could not' })).toHaveCount(0)

  await a.context().close()
  await b.context().close()
})

test('status pill shows "Reconnecting…" while offline and catches up when back online', async ({ browser }, info) => {
  const a = await openLiveBoard(browser, info, 'Offline')
  const b = await openLiveBoard(browser, info, 'Online')
  const pill = a.locator('.navbar .status')

  await a.context().setOffline(true)
  await expect(pill).toHaveText('Reconnecting…')

  // A change made while A is offline is picked up after it reconnects.
  await mouseDrag(b, paletteNote(b, ELIJ), duty(b, S1.id))
  await expect.poll(() => dbRows().length).toBe(1)

  await a.context().setOffline(false)
  await expect(pill).toHaveText(LIVE, { timeout: 10_000 })
  await expect(chip(a, S1.id, ELIJ)).toHaveCount(1)

  await a.context().close()
  await b.context().close()
})
