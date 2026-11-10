import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { Assignment, HistoryEvent } from '../config/types'
import { BackendError, type Backend, type SubscribeHandlers } from './types'

const TABLE = 'assignments'
const COLUMNS = 'id, operator_id, schedule_id, moved_by, client_id, moved_at'
const EVENTS = 'assignment_events'
// '*' rather than a column list: a database whose schema predates actor_email still answers.
const EVENT_COLUMNS = '*'

function toError(err: { code?: string; message: string }): BackendError {
  // 23505 = unique_violation → (operator_id, schedule_id) already exists
  if (err.code === '23505') return new BackendError('Already in this duty', 'duplicate')
  return new BackendError(err.message || 'Could not save change')
}

/** The email column isn't there yet (PGRST204 = unknown column): supabase/schema.sql hasn't been re-run. */
const noEmailColumn = (err: { code?: string; message?: string }) =>
  (err.code === 'PGRST204' || err.code === '42703') && /moved_by_email/.test(err.message ?? '')
function withoutEmail<T extends { moved_by_email?: unknown }>(v: T): Omit<T, 'moved_by_email'> {
  const { moved_by_email: _, ...rest } = v
  return rest
}

/** The paper-trail table / function isn't there yet: supabase/schema.sql hasn't been re-run. */
const missing = (err: { code?: string }) => err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST202'

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

    async fetchHistory({ beforeId, limit }) {
      let q = db.from(EVENTS).select(EVENT_COLUMNS).order('id', { ascending: false }).limit(limit)
      if (beforeId != null) q = q.lt('id', beforeId)
      const { data, error } = await q
      if (error) {
        if (missing(error)) throw new BackendError('History is not set up yet: re-run supabase/schema.sql', 'unavailable')
        throw toError(error)
      }
      return (data ?? []) as HistoryEvent[]
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
      // The paper trail gets its own channel, so a database without the history table
      // (schema not re-run yet) can't take the board's live updates down with it.
      const history: RealtimeChannel = db
        .channel('assignments-history')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: EVENTS }, (payload) => {
          h.onEvent(payload.new as HistoryEvent)
        })
        .subscribe()
      return () => {
        void db.removeChannel(channel)
        void db.removeChannel(history)
      }
    },

    async add(row) {
      let { error } = await db.from(TABLE).insert(row)
      if (error && noEmailColumn(error)) ({ error } = await db.from(TABLE).insert(withoutEmail(row)))
      if (error) throw toError(error)
    },

    async move(id, patch) {
      let { data, error } = await db.from(TABLE).update(patch).eq('id', id).select('id')
      if (error && noEmailColumn(error)) ({ data, error } = await db.from(TABLE).update(withoutEmail(patch)).eq('id', id).select('id'))
      if (error) throw toError(error)
      if (!data?.length) throw new BackendError('That sticky was already removed', 'not_found')
    },

    async remove(id, by) {
      // Through remove_assignment() so the paper trail knows who removed it.
      let { error } = await db.rpc('remove_assignment', {
        p_id: id,
        p_actor: by.actor,
        p_actor_email: by.actor_email,
        p_client_id: by.client_id,
      })
      if (!error) return
      if (!missing(error)) throw toError(error)
      // Schema predates emails: the 3-argument version still records the name.
      ;({ error } = await db.rpc('remove_assignment', { p_id: id, p_actor: by.actor, p_client_id: by.client_id }))
      if (!error) return
      if (!missing(error)) throw toError(error)
      // Older database without the function: a plain delete still works (logged as "someone").
      const res = await db.from(TABLE).delete().eq('id', id)
      if (res.error) throw toError(res.error)
    },
  }
}
