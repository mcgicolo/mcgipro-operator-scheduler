// Turns raw paper-trail events into what the History sheet shows: readable entries
// (quick back-to-back moves of one sticky by one person folded together), filters and
// day sections.
import type { HistoryAction, HistoryEvent } from '../config/types'

/** One row in the History list: a single change, or a quick series folded into one. */
export interface HistoryEntry {
  /** Newest event id: stable key, and what "new" is measured against. */
  id: number
  /** Event ids folded into this entry, newest first. */
  ids: number[]
  action: HistoryAction
  /** When the latest change in the series happened. */
  at: string
  assignmentId: string
  operatorId: string
  from: string | null
  to: string | null
  actor: string | null
  clientId: string | null
}

/** Moves of the same sticky by the same person within this window read as one change. */
const FOLD_MS = 5 * 60_000

function entryOf(e: HistoryEvent): HistoryEntry {
  return {
    id: e.id,
    ids: [e.id],
    action: e.action,
    at: e.at,
    assignmentId: e.assignment_id,
    operatorId: e.operator_id,
    from: e.from_schedule_id,
    to: e.to_schedule_id,
    actor: e.actor,
    clientId: e.client_id,
  }
}

/**
 * `events` newest first → entries newest first. An older add/move is folded into the
 * newer move right after it when it is the same sticky, same person and device, and
 * within FOLD_MS: "added to A, moved to B, moved to C" reads "added to C". A series
 * that ends where it started (A → B → A) is left as separate rows, so nothing vanishes.
 */
export function buildEntries(events: HistoryEvent[]): HistoryEntry[] {
  const out: HistoryEntry[] = []
  for (const e of events) {
    const cur = out.at(-1)
    if (
      cur &&
      cur.action === 'move' &&
      (e.action === 'move' || e.action === 'add') &&
      e.assignment_id === cur.assignmentId &&
      e.actor === cur.actor &&
      e.client_id === cur.clientId &&
      Date.parse(foldedStart(cur, events)) - Date.parse(e.at) <= FOLD_MS &&
      (e.action === 'add' || e.from_schedule_id !== cur.to)
    ) {
      cur.ids.push(e.id)
      cur.from = e.from_schedule_id
      if (e.action === 'add') cur.action = 'add'
      continue
    }
    out.push(entryOf(e))
  }
  return out
}

/** Time of the oldest event already folded into `entry`. */
function foldedStart(entry: HistoryEntry, events: HistoryEvent[]): string {
  const oldest = entry.ids.at(-1)
  return events.find((e) => e.id === oldest)?.at ?? entry.at
}

// ---------------------------------------------------------------- dates

const DAY = 86_400_000
const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** iOS-style section title: Today, Yesterday, weekday this week, else the date. */
export function dayTitle(iso: string, now: number): string {
  const t = Date.parse(iso)
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const d = new Date(t)
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Row time: "Just now" / "5 min ago" within the hour, else the clock time (the section has the day). */
export function rowTime(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  return clockTime(iso)
}

export function fullDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${clockTime(iso)}`
}

export interface DaySection<T> {
  title: string
  items: T[]
}

/** Splits entries (newest first) into day sections. */
export function byDay<T extends { at: string }>(items: T[], now: number): DaySection<T>[] {
  const out: DaySection<T>[] = []
  for (const it of items) {
    const title = dayTitle(it.at, now)
    if (out.at(-1)?.title === title) out.at(-1)!.items.push(it)
    else out.push({ title, items: [it] })
  }
  return out
}

export const ACTION_VERB: Record<HistoryAction, string> = { add: 'added', move: 'moved', remove: 'removed' }
