// Demo backend used when the Supabase env vars are empty.
// Stores assignments in localStorage and syncs across tabs of the same browser,
// so drag & drop and "live" updates can be tried without any server.
import type { Assignment } from '../config/types'
import { BackendError, type Backend, type SubscribeHandlers } from './types'

const KEY = 'mcgi-board:demo-assignments'

type Msg = { type: 'upsert'; row: Assignment } | { type: 'delete'; id: string }

function read(): Assignment[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Assignment[]
  } catch {
    return []
  }
}

function write(rows: Assignment[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    /* storage unavailable: changes stay in memory for this tab */
  }
}

export function createLocalBackend(): Backend {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mcgi-board') : null
  const post = (m: Msg) => channel?.postMessage(m)
  // Simulate network latency so optimistic UI paths get exercised.
  const delay = () => new Promise((r) => setTimeout(r, 120))

  return {
    kind: 'local',

    async fetchAll() {
      return read()
    },

    subscribe(h: SubscribeHandlers) {
      const onMsg = (e: MessageEvent<Msg>) => {
        if (e.data.type === 'upsert') h.onUpsert(e.data.row)
        else h.onDelete(e.data.id)
      }
      channel?.addEventListener('message', onMsg)
      h.onStatus('live')
      return () => channel?.removeEventListener('message', onMsg)
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
    },

    async move(id, patch) {
      await delay()
      const rows = read()
      const row = rows.find((r) => r.id === id)
      if (!row) throw new BackendError('That sticky was already removed', 'not_found')
      if (rows.some((r) => r.id !== id && r.operator_id === row.operator_id && r.schedule_id === patch.schedule_id)) {
        throw new BackendError('Already in this duty', 'duplicate')
      }
      Object.assign(row, patch)
      write(rows)
      post({ type: 'upsert', row })
    },

    async remove(id) {
      await delay()
      write(read().filter((r) => r.id !== id))
      post({ type: 'delete', id })
    },
  }
}
