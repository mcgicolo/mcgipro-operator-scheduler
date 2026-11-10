// Demo backend used when the Supabase env vars are empty.
// Stores assignments (and the paper trail) in localStorage and syncs across tabs of the same
// browser, so drag & drop and "live" updates can be tried without any server.
import type { Assignment, HistoryEvent } from '../config/types'
import { BackendError, type Backend, type SubscribeHandlers } from './types'

const KEY = 'mcgi-board:demo-assignments'
const HISTORY_KEY = 'mcgi-board:demo-history'
/** The demo keeps the latest entries only (localStorage is small). */
const HISTORY_MAX = 500

type Msg = { type: 'upsert'; row: Assignment } | { type: 'delete'; id: string } | { type: 'event'; event: HistoryEvent }

function load<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[]
  } catch {
    return []
  }
}

function save(key: string, rows: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows))
  } catch {
    /* storage unavailable: changes stay in memory for this tab */
  }
}

const read = () => load<Assignment>(KEY)
const write = (rows: Assignment[]) => save(KEY, rows)

export function createLocalBackend(): Backend {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mcgi-board') : null
  const post = (m: Msg) => channel?.postMessage(m)
  // Simulate network latency so optimistic UI paths get exercised.
  const delay = () => new Promise((r) => setTimeout(r, 120))
  /** This tab's handlers: a BroadcastChannel doesn't echo to its sender, so our own entries go here. */
  let self: SubscribeHandlers | null = null

  /** Appends a paper-trail entry, like the database trigger does. */
  function log(e: Omit<HistoryEvent, 'id' | 'at'>) {
    const history = load<HistoryEvent>(HISTORY_KEY) // oldest first
    const event: HistoryEvent = { id: (history.at(-1)?.id ?? 0) + 1, at: new Date().toISOString(), ...e }
    history.push(event)
    save(HISTORY_KEY, history.slice(-HISTORY_MAX))
    post({ type: 'event', event })
    self?.onEvent(event)
  }

  return {
    kind: 'local',

    async fetchAll() {
      return read()
    },

    async fetchHistory({ beforeId, limit }) {
      return load<HistoryEvent>(HISTORY_KEY)
        .filter((e) => beforeId == null || e.id < beforeId)
        .reverse()
        .slice(0, limit)
    },

    subscribe(h: SubscribeHandlers) {
      self = h
      const onMsg = (e: MessageEvent<Msg>) => {
        if (e.data.type === 'upsert') h.onUpsert(e.data.row)
        else if (e.data.type === 'delete') h.onDelete(e.data.id)
        else h.onEvent(e.data.event)
      }
      channel?.addEventListener('message', onMsg)
      h.onStatus('live')
      return () => {
        self = null
        channel?.removeEventListener('message', onMsg)
      }
    },

    async add(row) {
      await delay()
      const rows = read()
      if (rows.some((r) => r.operator_id === row.operator_id && r.schedule_id === row.schedule_id)) {
        throw new BackendError('Already in this duty', 'duplicate')
      }
      rows.push(row)
      write(rows)
      post({ type: 'upsert', row })
      log({
        action: 'add',
        assignment_id: row.id,
        operator_id: row.operator_id,
        from_schedule_id: null,
        to_schedule_id: row.schedule_id,
        actor: row.moved_by,
        actor_email: row.moved_by_email ?? null,
        client_id: row.client_id,
      })
    },

    async move(id, patch) {
      await delay()
      const rows = read()
      const row = rows.find((r) => r.id === id)
      if (!row) throw new BackendError('That sticky was already removed', 'not_found')
      if (rows.some((r) => r.id !== id && r.operator_id === row.operator_id && r.schedule_id === patch.schedule_id)) {
        throw new BackendError('Already in this duty', 'duplicate')
      }
      const from = row.schedule_id
      Object.assign(row, patch)
      write(rows)
      post({ type: 'upsert', row })
      if (from !== row.schedule_id) {
        log({
          action: 'move',
          assignment_id: id,
          operator_id: row.operator_id,
          from_schedule_id: from,
          to_schedule_id: row.schedule_id,
          actor: patch.moved_by,
          actor_email: patch.moved_by_email ?? null,
          client_id: patch.client_id,
        })
      }
    },

    async remove(id, by) {
      await delay()
      const rows = read()
      const row = rows.find((r) => r.id === id)
      write(rows.filter((r) => r.id !== id))
      post({ type: 'delete', id })
      if (row) {
        log({
          action: 'remove',
          assignment_id: id,
          operator_id: row.operator_id,
          from_schedule_id: row.schedule_id,
          to_schedule_id: null,
          actor: by.actor,
          actor_email: by.actor_email,
          client_id: by.client_id,
        })
      }
    },
  }
}
