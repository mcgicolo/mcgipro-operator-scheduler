import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type BrowserContext, type CDPSession, type Locator, type Page } from '@playwright/test'

// ---------------------------------------------------------------- config (read from the app's own JSON)

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(root, 'public', file), 'utf8')) as T

interface GatheringType { id: string; name: string; order: number }
interface Schedule { id: string; gatheringTypeId: string; mode: 'LIVE' | 'PLAYBACK'; day: string; time: string; order: number }
interface Operator { id: string; name: string }

export const scheduleConfig = readJson<{ title: string; month: string; gatheringTypes: GatheringType[]; schedules: Schedule[] }>(
  'schedule.json',
)
export const operators = readJson<{ operators: Operator[] }>('operators.json').operators

/** Gathering types and their schedules, in board order (same rule as the app's `groups`). */
export const groups = [...scheduleConfig.gatheringTypes]
  .sort((a, b) => a.order - b.order)
  .map((g) => ({
    ...g,
    schedules: scheduleConfig.schedules.filter((s) => s.gatheringTypeId === g.id).sort((a, b) => a.order - b.order),
  }))
  .filter((g) => g.schedules.length > 0)

/** All schedules in board order (left→right on desktop, top→bottom on phone, and sheet row order). */
export const schedules = groups.flatMap((g) => g.schedules)

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
export const scheduleLabel = (s: Schedule) => `${s.mode} ${s.day} ${formatTime(s.time)}`

// ---------------------------------------------------------------- setup

/** Sets a name and work email so the profile gate is skipped. */
export async function setNickname(context: BrowserContext, name = 'E2E', email = 'e2e@example.com') {
  await context.addInitScript(
    ([n, e]) => {
      localStorage.setItem('nickname', n)
      localStorage.setItem('email', e)
    },
    [name, email] as const,
  )
}

/** Opens the board and waits until the palette has rendered. */
export async function openBoard(page: Page) {
  await page.goto('./')
  await expect(page.locator('aside.palette .v-palette')).toHaveCount(operators.length)
}

// ---------------------------------------------------------------- locators

export const duty = (page: Page, scheduleId: string) => page.locator(`.duty[data-drop="schedule:${scheduleId}"]`)
export const chips = (page: Page, scheduleId: string) => duty(page, scheduleId).locator('.v-chip')
export const chip = (page: Page, scheduleId: string, name: string) =>
  chips(page, scheduleId).filter({ has: page.locator('.name', { hasText: name }) })
export const paletteNote = (page: Page, name: string) =>
  page.locator('aside.palette .v-palette').filter({ has: page.locator('.name', { hasText: name }) })
export const confirmDialog = (page: Page) => page.locator('[role="alertdialog"][aria-labelledby="cr-title"]')

async function center(loc: Locator) {
  const b = await loc.boundingBox()
  if (!b) throw new Error(`no bounding box for ${loc}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** A point inside a duty's drop area (its body, below the header). */
async function dropPoint(target: Locator) {
  const b = await target.boundingBox()
  if (!b) throw new Error(`no bounding box for ${target}`)
  return { x: b.x + b.width / 2, y: b.y + Math.min(b.height - 8, Math.max(b.height * 0.6, 40)) }
}

// ---------------------------------------------------------------- mouse drag (desktop)

/** Real mouse drag: press, pass the 4px slop, glide to the target, release. */
export async function mouseDrag(page: Page, source: Locator, target: Locator) {
  const from = await center(source)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 3 })
  const to = await dropPoint(target)
  await page.mouse.move(to.x, to.y, { steps: 15 })
  await page.waitForTimeout(50)
  await page.mouse.up()
}

// ---------------------------------------------------------------- touch (mobile, via CDP)

type Pt = { x: number; y: number }

export class Touch {
  private constructor(private cdp: CDPSession, private page: Page) {}

  static async attach(page: Page) {
    return new Touch(await page.context().newCDPSession(page), page)
  }

  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Pt) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1, radiusX: 2, radiusY: 2, force: 1 }] : [],
    })
  }

  async start(p: Pt) {
    await this.send('touchStart', p)
  }

  /** Moves in `steps` small increments with short waits, like a finger. */
  async move(from: Pt, to: Pt, steps = 15, stepMs = 16) {
    for (let i = 1; i <= steps; i++) {
      await this.send('touchMove', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps })
      await this.page.waitForTimeout(stepMs)
    }
  }

  async end() {
    await this.send('touchEnd')
  }

  /** Touch drag from the center of `source` to `target`; `holdMs` > 200 makes it a long-press drag. */
  async drag(source: Locator, target: Locator | Pt, { holdMs = 0, steps = 15 } = {}) {
    // Tray stickies can sit off-screen in the horizontally scrolling list.
    await source.scrollIntoViewIfNeeded()
    await this.page.waitForTimeout(150) // let scroll-snap settle
    const from = await center(source)
    const to = 'x' in target ? target : await dropPoint(target)
    await this.start(from)
    if (holdMs) await this.page.waitForTimeout(holdMs)
    await this.move(from, to, steps)
    await this.page.waitForTimeout(50)
    await this.end()
  }

  /** Horizontal swipe starting on `source`. */
  async swipe(source: Locator, dx: number, steps = 15) {
    const from = await center(source)
    await this.start(from)
    await this.move(from, { x: from.x + dx, y: from.y }, steps)
    await this.end()
  }
}
