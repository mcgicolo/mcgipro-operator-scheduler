// Paper trail (History sheet) in demo mode: runs in both the desktop and mobile projects.
// Changes are made with the tap sheets, which work the same on both layouts.
import { expect, test, type Page } from '@playwright/test'
import { chip, confirmDialog, openBoard, operators, paletteNote, schedules, setNickname } from './helpers'

const [S1, S2] = schedules
const ELIJ = 'Elij Cañaveral'
const VICTOR = 'Victor Toledo'
const opId = (name: string) => operators.find((o) => o.name === name)!.id

const historyBtn = (page: Page) => page.locator('.navbar .nav-btn.history')
const historySheet = (page: Page) => page.getByRole('dialog', { name: 'History' })
const rows = (page: Page) => historySheet(page).locator('.list-view .row')

/** Tray note → "Assign Duties" sheet → tick a duty → Done. */
async function assign(page: Page, name: string, scheduleId: string) {
  await paletteNote(page, name).locator('.face').click()
  const sheet = page.getByRole('dialog', { name })
  await sheet.locator('.cell[role="checkbox"]').nth(schedules.findIndex((s) => s.id === scheduleId)).click()
  await expect(chip(page, scheduleId, name)).toHaveCount(1)
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
}

/** Placed sticky → "Move to…" sheet → pick a duty. */
async function move(page: Page, name: string, fromId: string, toId: string) {
  await chip(page, fromId, name).locator('.face').click()
  const sheet = page.getByRole('dialog', { name })
  await sheet.locator('.cell:not(.destructive):not(.link)').nth(schedules.findIndex((s) => s.id === toId)).click()
  await expect(chip(page, toId, name)).toHaveCount(1)
}

async function remove(page: Page, name: string, scheduleId: string) {
  await chip(page, scheduleId, name).locator('.face').click()
  await page.getByRole('dialog', { name }).getByRole('button', { name: 'Remove from This Duty' }).click()
  await confirmDialog(page).locator('.action.destructive').click()
  await expect(chip(page, scheduleId, name)).toHaveCount(0)
}

async function openHistory(page: Page) {
  await historyBtn(page).click()
  await expect(historySheet(page)).toBeVisible()
}

test.beforeEach(async ({ context, page }) => {
  await setNickname(context, 'Jon')
  await openBoard(page)
  await expect(page.locator('.navbar .status')).toHaveText('Demo mode')
})

test('records who added, moved and removed a sticky; quick add + move read as one', async ({ page }) => {
  await openHistory(page)
  await expect(historySheet(page).getByRole('heading', { name: 'No Changes Yet' })).toBeVisible()
  await historySheet(page).getByRole('button', { name: 'Done' }).click()

  await assign(page, ELIJ, S1.id)
  await move(page, ELIJ, S1.id, S2.id)
  await remove(page, ELIJ, S2.id)

  await openHistory(page)
  await expect(historySheet(page).locator('.sec-title').first()).toHaveText('Today')
  // Newest first. The add and the move a moment later (same person, same sticky) are one row.
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(0)).toHaveAccessibleName(new RegExp(`^You removed ${ELIJ} from .*${S2.day}`))
  await expect(rows(page).nth(0).locator('.verb')).toHaveText('Removed from')
  await expect(rows(page).nth(1)).toHaveAccessibleName(new RegExp(`^You added ${ELIJ} to .*${S2.day}`))
  await expect(rows(page).nth(1).locator('.row-by')).toContainText('2 quick changes')

  // Filters
  const seg = historySheet(page).getByRole('radiogroup', { name: 'Show' })
  await seg.getByRole('radio', { name: 'Removed', exact: true }).click()
  await expect(rows(page)).toHaveCount(1)
  await seg.getByRole('radio', { name: 'Moved', exact: true }).click()
  await expect(rows(page)).toHaveCount(0)
  await expect(historySheet(page).getByRole('heading', { name: 'No Results' })).toBeVisible()
  await historySheet(page).getByRole('button', { name: 'Show All Changes' }).click()
  await expect(seg.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true')
  await expect(rows(page)).toHaveCount(2)

  // Search ignores accents and case.
  const search = historySheet(page).getByRole('searchbox', { name: 'Search history' })
  await search.fill('canaveral')
  await expect(rows(page)).toHaveCount(2)
  await search.fill('nobody here')
  await expect(rows(page)).toHaveCount(0)
  await historySheet(page).getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()

  // Detail: pushed view with the sticky's whole trail (3 events).
  await rows(page).nth(1).click()
  const detail = historySheet(page).getByRole('region', { name: 'Change details' })
  await expect(detail.locator('.hero-name')).toHaveText(ELIJ)
  await expect(detail.locator('.kv-row', { hasText: 'By' })).toContainText('Jon')
  await expect(detail.locator('.kv-row', { hasText: 'By' })).toContainText('This device')
  await expect(detail.locator('.timeline li')).toHaveCount(3)
  await expect(detail.getByText('This sticky is no longer on the board.')).toBeVisible()
  // Escape goes back to the list first, then closes the sheet.
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
  await expect(rows(page).nth(1)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(historySheet(page)).toBeHidden()
  await expect(historyBtn(page)).toBeFocused()
})

test('Show on Board closes History and points at the sticky', async ({ page }) => {
  await assign(page, VICTOR, S1.id)
  await openHistory(page)
  await rows(page).first().click()
  await historySheet(page).getByRole('button', { name: 'Show on Board' }).click()
  await expect(historySheet(page)).toBeHidden()
  const placed = chip(page, S1.id, VICTOR)
  await expect(placed).toBeInViewport()
  await expect(placed.locator('.face')).toBeFocused()
})

test('"View History" on a sticky opens History searched for that operator', async ({ page }) => {
  await assign(page, VICTOR, S1.id)
  await assign(page, ELIJ, S2.id)
  await chip(page, S1.id, VICTOR).locator('.face').click()
  await page.getByRole('dialog', { name: VICTOR }).getByRole('button', { name: /View History/ }).click()
  await expect(historySheet(page)).toBeVisible()
  await expect(historySheet(page).getByRole('searchbox', { name: 'Search history' })).toHaveValue(VICTOR)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toHaveAccessibleName(new RegExp(`^You added ${VICTOR}`))
})

test('changes by other people show a badge until History is opened, and arrive live', async ({ context, page }) => {
  // Two earlier changes by another device that this device hasn't seen yet.
  await page.evaluate(
    ({ elij, s1, s2 }) => {
      const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
      const base = { assignment_id: '7e57c0de-0000-4000-8000-000000000001', operator_id: elij, actor: 'Ana', client_id: 'other-device' }
      localStorage.setItem(
        'mcgi-board:demo-history',
        JSON.stringify([
          { ...base, id: 1, at: at(30), action: 'add', from_schedule_id: null, to_schedule_id: s1 },
          { ...base, id: 2, at: at(2), action: 'move', from_schedule_id: s1, to_schedule_id: s2 },
        ]),
      )
      localStorage.setItem('historySeenId', '0')
    },
    { elij: opId(ELIJ), s1: S1.id, s2: S2.id },
  )
  await page.reload()
  await expect(historyBtn(page)).toHaveAccessibleName('History, 2 new changes')
  await expect(historyBtn(page).locator('.h-badge')).toHaveText('2')

  await openHistory(page)
  await expect(rows(page)).toHaveCount(2) // moved 28 min later: two separate rows
  await expect(rows(page).first()).toHaveAccessibleName(new RegExp(`^Ana moved ${ELIJ} to `))
  await expect(historySheet(page).locator('.unseen')).toHaveCount(2)

  // Another tab (same browser) adds a sticky while History is open: it appears live.
  const other = await context.newPage()
  await openBoard(other)
  await assign(other, VICTOR, S1.id)
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).first()).toHaveAccessibleName(new RegExp(`^You added ${VICTOR}`))
  await other.close()

  await historySheet(page).getByRole('button', { name: 'Done' }).click()
  await expect(historyBtn(page)).toHaveAccessibleName('History')
  await expect(historyBtn(page).locator('.h-badge')).toHaveCount(0)
})
