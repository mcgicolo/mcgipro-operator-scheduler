import { computed, reactive } from 'vue'
import type { Assignment, GatheringType, Operator, Schedule, ScheduleConfig, OperatorsConfig } from '../config/types'
import { validateConfig } from '../config/validate'
import { createBackend, BackendError, type Backend, type ConnectionStatus } from '../api'
import { scheduleLabel, uuid } from '../utils/format'

// ---------------------------------------------------------------- device identity

const LS_NICK = 'nickname'
const LS_CLIENT = 'clientId'

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* private mode etc. — keep it in memory */
  }
}

function initClientId(): string {
  let id = lsGet(LS_CLIENT)
  if (!id) {
    id = uuid()
    lsSet(LS_CLIENT, id)
  }
  return id
}

// ---------------------------------------------------------------- state

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

interface State {
  phase: 'loading' | 'error' | 'ready'
  configErrors: string[]
  loadError: string | null
  title: string
  month: string
  instructions: string
  gatheringTypes: GatheringType[]
  schedules: Schedule[]
  operators: Operator[]
  assignments: Record<string, Assignment>
  nickname: string
  clientId: string
  backendKind: 'supabase' | 'postgres' | 'local' | null
  connection: ConnectionStatus
  toasts: Toast[]
  now: number
  /** Assignment waiting for the user to confirm its removal. */
  confirmRemoveId: string | null
}

export const state = reactive<State>({
  phase: 'loading',
  configErrors: [],
  loadError: null,
  title: '',
  month: '',
  instructions: '',
  gatheringTypes: [],
  schedules: [],
  operators: [],
  assignments: {},
  nickname: (lsGet(LS_NICK) || '').trim(),
  clientId: initClientId(),
  backendKind: null,
  connection: 'connecting',
  toasts: [],
  now: Date.now(),
  confirmRemoveId: null,
})

let backend: Backend | null = null

/** A realtime event for a row, held back while we have a save of that row in flight. */
type RemoteEvent = { kind: 'upsert'; row: Assignment } | { kind: 'delete' }

/** Book-keeping for a row with in-flight optimistic saves. */
interface Pending {
  /** Saves still in flight (a fast user can issue a second move before the first one settles). */
  inFlight: number
  /** Sequence number of the most recently issued save. */
  lastSeq: number
  /** What the server holds as far as we know: the row before the first in-flight save, then the
   *  result of the latest-issued save that succeeded. Restored when the latest save fails. */
  confirmed: Assignment | null
  confirmedSeq: number
  lastFailed: boolean
  /** The server said the row no longer exists (a move hit 404), or our own remove succeeded. */
  gone: boolean
  /** Latest realtime event for the row received while saves were in flight (events arrive in commit order). */
  remote?: RemoteEvent
}

/** Rows with an in-flight optimistic change; realtime events and resyncs must not overwrite them. */
const pending = new Map<string, Pending>()
let saveSeq = 0

// ---------------------------------------------------------------- derived

export const operatorsById = computed(() => new Map(state.operators.map((o) => [o.id, o])))
export const schedulesById = computed(() => new Map(state.schedules.map((s) => [s.id, s])))

/** Gathering types in order, each with its schedules in order. Schedules of removed types are dropped. */
export const groups = computed(() =>
  [...state.gatheringTypes]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      ...g,
      short: (g.short || g.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3)).toUpperCase(),
      schedules: state.schedules.filter((s) => s.gatheringTypeId === g.id).sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.schedules.length > 0),
)

/** Schedules that are actually on the board (their gathering type exists). */
export const visibleScheduleIds = computed(() => new Set(groups.value.flatMap((g) => g.schedules.map((s) => s.id))))

const byPlacement = (a: Assignment, b: Assignment) =>
  a.moved_at < b.moved_at ? -1 : a.moved_at > b.moved_at ? 1 : a.id < b.id ? -1 : 1

/**
 * Visible assignments grouped by schedule, in placement order.
 * Rows whose schedule or operator no longer exists in config are hidden (never deleted).
 */
export const assignmentsBySchedule = computed(() => {
  const out: Record<string, Assignment[]> = {}
  for (const id of visibleScheduleIds.value) out[id] = []
  for (const a of Object.values(state.assignments)) {
    if (!out[a.schedule_id] || !operatorsById.value.has(a.operator_id)) continue
    out[a.schedule_id].push(a)
  }
  for (const list of Object.values(out)) list.sort(byPlacement)
  return out
})

export function findAssignment(operatorId: string, scheduleId: string): Assignment | undefined {
  return assignmentsBySchedule.value[scheduleId]?.find((a) => a.operator_id === operatorId)
}

// ---------------------------------------------------------------- toasts

let toastSeq = 0
export function dismissToast(id: number) {
  const i = state.toasts.findIndex((x) => x.id === id)
  if (i >= 0) state.toasts.splice(i, 1)
}
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t: Toast = { id: ++toastSeq, text, kind }
  state.toasts.push(t)
  if (state.toasts.length > 2) state.toasts.shift()
  setTimeout(() => dismissToast(t.id), 2600)
}

// ---------------------------------------------------------------- nickname

export function setNickname(name: string) {
  state.nickname = name.trim()
  lsSet(LS_NICK, state.nickname)
}

// ---------------------------------------------------------------- loading + sync

async function fetchJson(file: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}${file}`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load ${file} (HTTP ${res.status})`)
  return res.json()
}

async function resync() {
  if (!backend) return
  try {
    const rows = await backend.fetchAll()
    const next: Record<string, Assignment> = {}
    for (const r of rows) next[r.id] = r
    // Keep our own optimistic version of rows that are mid-flight.
    for (const [id] of pending) {
      const local = state.assignments[id]
      if (local) next[id] = local
      else delete next[id]
    }
    state.assignments = next
  } catch (e) {
    toast(`Sync failed: ${(e as Error).message}`, 'error')
  }
}

export async function init() {
  try {
    const [schedule, operators] = await Promise.all([fetchJson('schedule.json'), fetchJson('operators.json')])
    const errors = validateConfig(schedule, operators)
    if (errors.length) {
      state.configErrors = errors
      state.phase = 'error'
      return
    }
    const s = schedule as ScheduleConfig
    state.title = s.title
    state.month = s.month
    state.instructions = s.instructions ?? ''
    state.gatheringTypes = s.gatheringTypes
    state.schedules = s.schedules
    state.operators = (operators as OperatorsConfig).operators

    backend = await createBackend()
    state.backendKind = backend.kind
    backend.subscribe({
      // While a save of the row is in flight, keep the optimistic version on screen but remember
      // the newest server event; it is applied when the save settles (see commit()).
      onUpsert(row) {
        const p = pending.get(row.id)
        if (p) p.remote = { kind: 'upsert', row }
        else state.assignments[row.id] = row
      },
      onDelete(id) {
        const p = pending.get(id)
        if (p) p.remote = { kind: 'delete' }
        else delete state.assignments[id]
      },
      onReconnect: resync,
      onStatus(s) {
        state.connection = s
      },
    })
    await resync()
    state.phase = 'ready'
  } catch (e) {
    state.loadError = (e as Error).message
    state.phase = 'error'
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void resync()
  })
  window.addEventListener('online', () => void resync())
  setInterval(() => (state.now = Date.now()), 30_000)
}

// ---------------------------------------------------------------- changes (optimistic)

const recent: number[] = []
/** Client-side abuse guard: at most 5 changes per second. */
function throttled(): boolean {
  const t = Date.now()
  while (recent.length && t - recent[0] > 1000) recent.shift()
  if (recent.length >= 5) {
    toast('Slow down a little 🙂', 'error')
    return true
  }
  recent.push(t)
  return false
}

/**
 * Runs one optimistic save of row `id`. `before` is the row as it was before this change (null for
 * an add); the optimistic version is already in state. When the last in-flight save of the row
 * settles, the board is reconciled with the server:
 *   1. if the row is gone on the server (a move got not_found, or our remove succeeded) → drop it;
 *   2. else a realtime event received meanwhile is the newest server truth → apply it;
 *   3. else, if the latest save failed (duplicate, network, …) → roll back to the last confirmed row;
 *   4. else the optimistic version is what the server has → keep it.
 */
async function commit(id: string, before: Assignment | null, run: () => Promise<void>, failMsg: string, isRemove = false) {
  const seq = ++saveSeq
  let p = pending.get(id)
  if (!p) {
    p = { inFlight: 0, lastSeq: 0, confirmed: before, confirmedSeq: 0, lastFailed: false, gone: false }
    pending.set(id, p)
  }
  p.inFlight++
  p.lastSeq = seq
  const after = isRemove ? null : state.assignments[id] ? { ...state.assignments[id] } : null
  let failed = false
  try {
    await run()
    if (isRemove) p.gone = true
    if (seq > p.confirmedSeq) {
      p.confirmed = after
      p.confirmedSeq = seq
    }
  } catch (e) {
    failed = true
    const err = e as BackendError
    if (err.code === 'not_found') p.gone = true
    toast(err.code === 'duplicate' ? 'Already in this duty' : `${failMsg}: ${err.message}`, 'error')
  }
  if (seq === p.lastSeq) p.lastFailed = failed
  if (--p.inFlight > 0) return
  pending.delete(id)

  if (p.gone) {
    // Ids are never reused, so a deleted row stays deleted (even if an older upsert was remembered).
    delete state.assignments[id]
  } else if (p.remote) {
    if (p.remote.kind === 'upsert') state.assignments[id] = p.remote.row
    else delete state.assignments[id]
  } else if (p.lastFailed) {
    if (p.confirmed) state.assignments[id] = p.confirmed
    else delete state.assignments[id]
  }
}

export type ChangeResult = 'ok' | 'duplicate' | 'noop' | 'blocked'

export function addAssignment(operatorId: string, scheduleId: string): ChangeResult {
  if (!backend || !state.nickname) return 'blocked'
  if (findAssignment(operatorId, scheduleId)) {
    toast('Already in this duty', 'error')
    return 'duplicate'
  }
  if (throttled()) return 'blocked'
  const row: Assignment = {
    id: uuid(),
    operator_id: operatorId,
    schedule_id: scheduleId,
    moved_by: state.nickname,
    client_id: state.clientId,
    moved_at: new Date().toISOString(),
  }
  state.assignments[row.id] = row
  const b = backend
  void commit(row.id, null, () => b.add(row), 'Could not add')
  return 'ok'
}

export function moveAssignment(id: string, toScheduleId: string): ChangeResult {
  const cur = state.assignments[id]
  if (!backend || !cur || !state.nickname) return 'blocked'
  if (cur.schedule_id === toScheduleId) return 'noop'
  if (findAssignment(cur.operator_id, toScheduleId)) {
    toast('Already in this duty', 'error')
    return 'duplicate'
  }
  if (throttled()) return 'blocked'
  const patch = {
    schedule_id: toScheduleId,
    moved_by: state.nickname,
    client_id: state.clientId,
    moved_at: new Date().toISOString(),
  }
  const before = { ...cur }
  state.assignments[id] = { ...cur, ...patch }
  const b = backend
  void commit(id, before, () => b.move(id, patch), 'Could not move')
  return 'ok'
}

/** Every removal goes through a confirmation dialog (ConfirmRemove.vue). */
export function requestRemove(id: string) {
  if (state.assignments[id]) state.confirmRemoveId = id
}

export function removeAssignment(id: string): ChangeResult {
  const cur = state.assignments[id]
  if (!backend || !cur || !state.nickname) return 'blocked'
  if (throttled()) return 'blocked'
  const before = { ...cur }
  delete state.assignments[id]
  const b = backend
  void commit(id, before, () => b.remove(id), 'Could not remove', true)
  toast(`Removed ${operatorsById.value.get(before.operator_id)?.name ?? 'sticky'}`)
  return 'ok'
}

// ---------------------------------------------------------------- export as text

export function buildScheduleText(): string {
  const lines = [`${state.title} — Month of ${state.month}`]
  for (const g of groups.value) {
    lines.push('', g.name)
    for (const s of g.schedules) {
      const names = (assignmentsBySchedule.value[s.id] ?? [])
        .map((a) => operatorsById.value.get(a.operator_id)?.name)
        .filter(Boolean)
      lines.push(`• ${scheduleLabel(s)}: ${names.length ? names.join(', ') : '—'}`)
    }
  }
  return lines.join('\n')
}
