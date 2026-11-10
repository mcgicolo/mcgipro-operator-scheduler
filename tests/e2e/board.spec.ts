import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  Touch,
  chip,
  chips,
  confirmDialog,
  duty,
  groups,
  mouseDrag,
  openBoard,
  operators,
  paletteNote,
  scheduleConfig,
  scheduleLabel,
  schedules,
  setNickname,
} from './helpers'

const [S1, S2, S3, S4, , , , , S9] = schedules
const ELIJ = 'Elij Cañaveral'
const VICTOR = 'Victor Toledo'
const ANDREI = 'Andrei Dacanay'

// Tags pick the project: '@desktop' tests run only in the "desktop" project and '@mobile' only in
// "mobile" (grepInvert in playwright.config.ts). Untagged tests run in both.

// ---------------------------------------------------------------- 1. name gate

test.describe('name gate', () => {
  test('blocks the board until a valid name is entered; a returning visit skips it', async ({ page }) => {
    await page.goto('./')
    const gate = page.getByRole('dialog').filter({ has: page.getByPlaceholder('Name or nickname') })
    await expect(gate).toBeVisible()
    await expect(page.locator('main.board')).toHaveAttribute('inert', /.*/)

    const input = page.getByPlaceholder('Name or nickname')
    const submit = gate.getByRole('button', { name: 'Continue' })

    // < 2 characters (after trimming) is invalid.
    await input.fill(' A ')
    await expect(submit).toBeDisabled()
    await input.blur()
    await expect(gate.locator('#gate-err')).toHaveText('At least 2 characters')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await input.press('Enter')
    await expect(gate).toBeVisible()

    // A valid name alone isn't enough: the work email is required too.
    await input.fill('  Jo  ')
    await expect(submit).toBeDisabled()
    const email = page.getByPlaceholder('Work email')
    await email.fill('jo@')
    await email.blur()
    await expect(gate.locator('#gate-email-err')).toHaveText(/valid email/)
    await expect(submit).toBeDisabled()
    await email.fill(' Jo@Example.com ')
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(gate).toBeHidden()
    await expect(page.locator('main.board')).not.toHaveAttribute('inert', /.*/)
    expect(await page.evaluate(() => localStorage.getItem('nickname'))).toBe('Jo')
    expect(await page.evaluate(() => localStorage.getItem('email'))).toBe('jo@example.com')
    await expect(page.locator('.navbar .nick')).toHaveText('Jo')

    // Returning visitor: no gate.
    await page.reload()
    await expect(page.locator('aside.palette .v-palette')).toHaveCount(operators.length)
    await expect(page.getByPlaceholder('Name or nickname')).toHaveCount(0)

    // Name and email can be changed at any time from the top bar.
    await page.locator('.navbar .nav-btn.me').click()
    await expect(page.getByPlaceholder('Name or nickname')).toHaveValue('Jo')
    await page.getByPlaceholder('Work email').fill('jo.new@example.com')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByPlaceholder('Work email')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('email'))).toBe('jo.new@example.com')
  })

  test('an invalid saved email, or one cleared in another tab, brings the modal back', async ({ context, page }) => {
    // Seed only once, so the second tab below doesn't write the bad email back.
    await context.addInitScript(() => {
      if (localStorage.getItem('nickname')) return
      localStorage.setItem('nickname', 'Jo')
      localStorage.setItem('email', 'not-an-email')
    })
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Add your work email' })).toBeVisible()
    await page.getByPlaceholder('Work email').fill('jo@example.com')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByPlaceholder('Work email')).toHaveCount(0)

    // Another tab of the same site clears the email: this tab asks again without a reload.
    const other = await context.newPage()
    await other.goto(page.url())
    await other.evaluate(() => localStorage.removeItem('email'))
    await expect(page.getByRole('heading', { name: 'Add your work email' })).toBeVisible()
    await expect(page.locator('main.board')).toHaveAttribute('inert', /.*/)
  })

  test('someone with a name but no email yet is asked for the email only', async ({ context, page }) => {
    await context.addInitScript(() => localStorage.setItem('nickname', 'Jo'))
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Add your work email' })).toBeVisible()
    await expect(page.getByPlaceholder('Name or nickname')).toHaveValue('Jo')
    await expect(page.getByPlaceholder('Work email')).toBeFocused()
    await page.getByPlaceholder('Work email').fill('jo@example.com')
    await page.getByPlaceholder('Work email').press('Enter')
    await expect(page.getByPlaceholder('Work email')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------- board flows

test.describe('board', () => {
  test.beforeEach(async ({ context, page }) => {
    await setNickname(context)
    await openBoard(page)
    // The suite must run against the local demo backend, never Supabase.
    await expect(page.locator('.navbar .status')).toHaveText('Demo mode')
  })

  test.describe('desktop', { tag: '@desktop' }, () => {
    test('palette → column adds a copy; one operator in 3 duties; duplicate drop rejected', async ({ page }) => {
      const palette = page.locator('aside.palette .v-palette')

      await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S1.id))
      await expect(chip(page, S1.id, ELIJ)).toHaveCount(1)
      // A copy: the palette still has every operator, including Elij.
      await expect(palette).toHaveCount(operators.length)
      await expect(paletteNote(page, ELIJ)).toHaveCount(1)

      await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S4.id))
      await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S9.id))
      for (const s of [S1, S4, S9]) await expect(chip(page, s.id, ELIJ)).toHaveCount(1)
      await expect(page.locator('.duty .v-chip')).toHaveCount(3)
      await expect(palette).toHaveCount(operators.length)

      // Same operator into the same duty again → rejected with a toast.
      await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S1.id))
      await expect(page.locator('.toast', { hasText: 'Already in this duty' })).toBeVisible()
      await expect(chips(page, S1.id)).toHaveCount(1)
      await expect(page.locator('.duty .v-chip')).toHaveCount(3)
    })

    test('drag a placed sticky to another column moves it', async ({ page }) => {
      await mouseDrag(page, paletteNote(page, VICTOR), duty(page, S2.id))
      await expect(chip(page, S2.id, VICTOR)).toHaveCount(1)

      await mouseDrag(page, chip(page, S2.id, VICTOR), duty(page, S3.id))
      await expect(chip(page, S3.id, VICTOR)).toHaveCount(1)
      await expect(chips(page, S2.id)).toHaveCount(0)
      await expect(page.locator('.duty .v-chip')).toHaveCount(1)
    })

    test('remove via ✕ asks to confirm (Cancel keeps, Remove removes)', async ({ page }) => {
      await mouseDrag(page, paletteNote(page, ANDREI), duty(page, S1.id))
      const placed = chip(page, S1.id, ANDREI)
      await expect(placed).toHaveCount(1)

      await placed.hover()
      await placed.locator('.remove').click()
      await expect(confirmDialog(page).locator('#cr-title')).toHaveText(`Remove ${ANDREI}?`)
      await confirmDialog(page).locator('.action.cancel').click()
      await expect(confirmDialog(page)).toBeHidden()
      await expect(placed).toHaveCount(1)

      await placed.hover()
      await placed.locator('.remove').click()
      await expect(confirmDialog(page).locator('#cr-title')).toHaveText(`Remove ${ANDREI}?`)
      await confirmDialog(page).locator('.action.destructive').click()
      await expect(confirmDialog(page)).toBeHidden()
      await expect(placed).toHaveCount(0)
      await expect(page.locator('aside.palette .v-palette')).toHaveCount(operators.length)
    })

    test('drag a placed sticky onto the operators panel removes it after confirmation', async ({ page }) => {
      await mouseDrag(page, paletteNote(page, ANDREI), duty(page, S4.id))
      const placed = chip(page, S4.id, ANDREI)
      await expect(placed).toHaveCount(1)

      await mouseDrag(page, placed, page.locator('aside.palette'))
      await expect(confirmDialog(page).locator('#cr-title')).toHaveText(`Remove ${ANDREI}?`)
      await confirmDialog(page).locator('.action.destructive').click()
      await expect(placed).toHaveCount(0)
      await expect(page.locator('.duty .v-chip')).toHaveCount(0)
    })

    test('drag a placed sticky onto the trash zone removes it after confirmation', async ({ page }) => {
      await mouseDrag(page, paletteNote(page, ANDREI), duty(page, S2.id))
      const placed = chip(page, S2.id, ANDREI)
      await expect(placed).toHaveCount(1)

      // The trash zone only exists while a placed sticky is being dragged.
      await expect(page.locator('.trash')).toHaveCount(0)
      const b = (await placed.boundingBox())!
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2 + 8, b.y + b.height / 2 + 8, { steps: 3 })
      const trash = page.locator('.trash[data-drop="remove"]')
      await expect(trash).toBeVisible()
      await page.waitForTimeout(300) // let the enter transition settle
      const t = (await trash.boundingBox())!
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 15 })
      await expect(trash).toHaveClass(/hot/)
      await page.mouse.up()

      await expect(confirmDialog(page).locator('#cr-title')).toHaveText(`Remove ${ANDREI}?`)
      await confirmDialog(page).locator('.action.destructive').click()
      await expect(placed).toHaveCount(0)
    })

    test('copy schedule puts the PLAN 5.4 text on the clipboard', async ({ page }) => {
      // Placement order matters inside a duty: Elij first, then Victor.
      await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S1.id))
      await expect(chip(page, S1.id, ELIJ)).toHaveCount(1)
      await mouseDrag(page, paletteNote(page, VICTOR), duty(page, S1.id))
      await expect(chip(page, S1.id, VICTOR)).toHaveCount(1)
      await mouseDrag(page, paletteNote(page, ANDREI), duty(page, S9.id))
      await expect(chip(page, S9.id, ANDREI)).toHaveCount(1)

      await page.getByRole('button', { name: 'Copy schedule as text' }).click()
      await expect(page.locator('.toast', { hasText: 'Schedule copied' })).toBeVisible()
      const text = await page.evaluate(() => navigator.clipboard.readText())

      const names: Record<string, string[]> = { [S1.id]: [ELIJ, VICTOR], [S9.id]: [ANDREI] }
      const expected = [`${scheduleConfig.title} — Month of ${scheduleConfig.month}`]
      for (const g of groups) {
        expected.push('', g.name)
        for (const s of g.schedules) expected.push(`• ${scheduleLabel(s)}: ${names[s.id]?.join(', ') ?? '—'}`)
      }
      expect(text.startsWith('OPERATOR SCHEDULING — Month of November')).toBe(true)
      expect(text).toBe(expected.join('\n'))
      // Spot-check against the literal example in PLAN 5.4.
      expect(text).toContain(`PRAYER MEETING\n• LIVE Wed 3:30 AM: ${ELIJ}, ${VICTOR}\n• PLAYBACK Wed 5:30 PM: —`)
    })

    test('live sync: a change in page A shows up in page B (BroadcastChannel)', async ({ page, context }) => {
      const pageB = await context.newPage()
      await openBoard(pageB)

      await mouseDrag(page, paletteNote(page, ELIJ), duty(page, S3.id))
      await expect(chip(page, S3.id, ELIJ)).toHaveCount(1)
      const t0 = Date.now()
      await expect(chip(pageB, S3.id, ELIJ)).toHaveCount(1, { timeout: 1500 })
      expect(Date.now() - t0).toBeLessThan(1500)

      // Move in A → moved in B.
      await mouseDrag(page, chip(page, S3.id, ELIJ), duty(page, S4.id))
      await expect(chip(pageB, S4.id, ELIJ)).toHaveCount(1, { timeout: 1500 })
      await expect(chips(pageB, S3.id)).toHaveCount(0)

      // Remove in B → gone in A.
      const placedB = chip(pageB, S4.id, ELIJ)
      await placedB.hover()
      await placedB.locator('.remove').click()
      await confirmDialog(pageB).locator('.action.destructive').click()
      await expect(chip(page, S4.id, ELIJ)).toHaveCount(0, { timeout: 1500 })
    })
  })

  test.describe('mobile', { tag: '@mobile' }, () => {
    test('pull a name up from the tray onto a duty', async ({ page }) => {
      const touch = await Touch.attach(page)
      const target = duty(page, S1.id)
      await expect(target).toBeInViewport()

      await touch.drag(paletteNote(page, ELIJ), target)
      await expect(chip(page, S1.id, ELIJ)).toHaveCount(1)
      await expect(page.locator('aside.palette .v-palette')).toHaveCount(operators.length)
    })

    test('a horizontal swipe on the tray scrolls it and places nothing', async ({ page }) => {
      const touch = await Touch.attach(page)
      const list = page.locator('aside.palette .list')
      const before = await list.evaluate((el) => el.scrollLeft)
      expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)

      await touch.swipe(paletteNote(page, operators[1].name), -220)
      await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before)
      await page.waitForTimeout(300)
      await expect(page.locator('.duty .v-chip')).toHaveCount(0)
      await expect(page.locator('.sheet')).toHaveCount(0)
    })

    test('long-press drag a placed note to another duty', async ({ page }) => {
      const touch = await Touch.attach(page)
      await touch.drag(paletteNote(page, VICTOR), duty(page, S1.id))
      const placed = chip(page, S1.id, VICTOR)
      await expect(placed).toHaveCount(1)

      const target = duty(page, S2.id)
      await expect(target).toBeInViewport()
      await touch.drag(placed, target, { holdMs: 350 })
      await expect(chip(page, S2.id, VICTOR)).toHaveCount(1)
      await expect(chips(page, S1.id)).toHaveCount(0)
    })

    test('tap fallback: tick 2 duties in the sheet, then remove one from its chip sheet', async ({ page }) => {
      await paletteNote(page, ANDREI).tap()
      const sheet = page.locator('.sheet[role="dialog"]')
      await expect(sheet).toBeVisible()
      const cells = sheet.locator('.cell[role="checkbox"]')
      await expect(cells).toHaveCount(schedules.length)

      await cells.nth(0).tap()
      await expect(cells.nth(0)).toHaveAttribute('aria-checked', 'true')
      await cells.nth(3).tap()
      await expect(cells.nth(3)).toHaveAttribute('aria-checked', 'true')
      await sheet.locator('.done').tap()
      await expect(sheet).toBeHidden()

      await expect(chip(page, S1.id, ANDREI)).toHaveCount(1)
      await expect(chip(page, S4.id, ANDREI)).toHaveCount(1)
      await expect(page.locator('.duty .v-chip')).toHaveCount(2)

      // Chip sheet → Remove from This Duty → confirm.
      await chip(page, S1.id, ANDREI).tap()
      await expect(sheet).toBeVisible()
      await sheet.locator('.cell.destructive', { hasText: 'Remove from This Duty' }).tap()
      await expect(confirmDialog(page).locator('#cr-title')).toHaveText(`Remove ${ANDREI}?`)
      await confirmDialog(page).locator('.action.destructive').tap()
      await expect(chip(page, S1.id, ANDREI)).toHaveCount(0)
      await expect(sheet).toBeHidden()
      await expect(chip(page, S4.id, ANDREI)).toHaveCount(1)
    })
  })
})

// ---------------------------------------------------------------- 9. config validation

test('npm run validate:config exits 0', { tag: '@desktop' }, async () => {  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  // execFileSync throws on a non-zero exit code.
  const out = execFileSync('npm', ['run', '--silent', 'validate:config'], { cwd: root, encoding: 'utf8' })
  expect(out).toContain('valid')
})
