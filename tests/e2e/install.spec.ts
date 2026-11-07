import { expect, test } from '@playwright/test'
import { openBoard, setNickname } from './helpers'

// The guide never auto-opens under automation (navigator.webdriver), so these tests turn
// that off to see what a real visitor gets. The mobile project uses an Android Chrome UA.
test.describe('Add to Home Screen guide', () => {
  test.beforeEach(async ({ context }) => {
    await setNickname(context)
    await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
  })

  test('mobile: opens on its own, snoozes, reopens from the list row, then goes away when added', { tag: '@mobile' }, async ({ page }) => {
    await openBoard(page)
    const guide = page.getByRole('dialog', { name: 'Add to Home Screen' })
    await expect(guide).toBeVisible({ timeout: 4000 })
    await expect(page.locator('main.board')).toHaveAttribute('inert', /.*/)
    await expect(guide.getByText('Tap the ⋮ menu')).toBeVisible()

    // Not Now: snoozed for 3 days, so a reload doesn't bring it back.
    await guide.getByRole('button', { name: 'Not Now' }).click()
    await expect(guide).toBeHidden()
    const until = Number(await page.evaluate(() => localStorage.getItem('installGuide')))
    expect(until - Date.now()).toBeGreaterThan(2.9 * 24 * 3600 * 1000)
    await page.reload()
    await expect(page.locator('aside.palette .v-palette').first()).toBeVisible()
    await page.waitForTimeout(2000)
    await expect(guide).toBeHidden()

    // The row at the end of the list opens it on demand; Esc closes and focus goes back.
    const row = page.getByRole('button', { name: /Add to Home Screen/ })
    await row.click()
    await expect(guide).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(guide).toBeHidden()
    await expect(row).toBeFocused()

    // I've Added It: never offered again.
    await row.click()
    await guide.getByRole('button', { name: 'I’ve Added It' }).click()
    await expect(guide).toBeHidden()
    await expect(row).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('installGuide'))).toBe('done')
  })

  test('desktop browser without an install prompt: not offered', { tag: '@desktop' }, async ({ page }) => {
    await openBoard(page)
    await page.waitForTimeout(2000)
    await expect(page.getByRole('dialog', { name: 'Add to Home Screen' })).toHaveCount(0)
    await expect(page.locator('.install-row')).toHaveCount(0)
  })
})
