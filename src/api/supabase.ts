import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { Assignment } from '../config/types'
import { BackendError, type Backend, type SubscribeHandlers } from './types'

const TABLE = 'assignments'
const COLUMNS = 'id, operator_id, schedule_id, moved_by, client_id, moved_at'

function toError(err: { code?: string; message: string }): BackendError {
  // 23505 = unique_violation → (operator_id, schedule_id) already exists
  if (err.code === '23505') return new BackendError('Already in this duty', 'duplicate')
  return new BackendError(err.message || 'Could not save change')
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const db = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  })

  return {
    kind: 'supabase',

    async fetchAll() {
      const { data, error } = await db.from(TABLE).select(COLUMNS)
      if (error) throw toError(error)
      return (data ?? []) as Assignment[]
    },

    subscribe(h: SubscribeHandlers) {
      h.onStatus('connecting')
      const channel: RealtimeChannel = db
        .channel('assignments-board')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as Partial<Assignment>).id
            if (id) h.onDelete(id)
          } else {
            h.onUpsert(payload.new as Assignment)
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            h.onStatus('live')
            h.onReconnect()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            h.onStatus('offline')
          }
        })
      return () => {
        void db.removeChannel(channel)
      }
    },

    async add(row) {
      const { error } = await db.from(TABLE).insert(row)
      if (error) throw toError(error)
    },

    async move(id, patch) {
      const { data, error } = await db.from(TABLE).update(patch).eq('id', id).select('id')
      if (error) throw toError(error)
      if (!data?.length) throw new BackendError('That sticky was already removed', 'not_found')
    },

    async remove(id) {
      const { error } = await db.from(TABLE).delete().eq('id', id)
      if (error) throw toError(error)
    },
  }
}
