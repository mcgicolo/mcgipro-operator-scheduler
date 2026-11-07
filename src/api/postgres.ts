// Local-development backend: talks to the Vite dev API in server/pgDevApi.ts,
// which sits on a local PostgreSQL database. Live updates arrive over SSE.
import type { Assignment, HistoryEvent } from '../config/types'
import { BackendError, type Backend, type SubscribeHandlers } from './types'

export function createPostgresBackend(): Backend {
  const api = `${import.meta.env.BASE_URL}api/`

  async function call(path: string, init?: RequestInit) {
    let res: Response
    try {
      res = await fetch(api + path, {
        ...init,
        headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      })
    } catch {
      throw new BackendError('Cannot reach the local dev server')
    }
    if (res.ok) return res
    const body = (await res.json().catch(() => ({}))) as { code?: BackendError['code']; message?: string }
    throw new BackendError(body.message || `Request failed (${res.status})`, body.code ?? 'other')
  }

  return {
    kind: 'postgres',

    async fetchAll() {
      return (await (await call('assignments')).json()) as Assignment[]
    },

    async fetchHistory({ beforeId, limit }) {
      const q = new URLSearchParams({ limit: String(limit) })
      if (beforeId != null) q.set('before', String(beforeId))
      return (await (await call(`history?${q}`)).json()) as HistoryEvent[]
    },

    subscribe(h: SubscribeHandlers) {
      let es: EventSource | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      let delay = 1000
      let stopped = false
      /** Last time anything (open, change, heartbeat) arrived on the stream. */
      let lastSeen = Date.now()

      const retryLater = () => {
        clearTimeout(timer)
        timer = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 10_000)
      }

      /** Drops the current stream (if any), shows "Reconnecting…" and opens a new one later. */
      const restart = (now = false) => {
        es?.close()
        es = null
        h.onStatus('offline')
        if (now) {
          delay = 1000
          clearTimeout(timer)
          connect()
        } else retryLater()
      }

      const connect = () => {
        if (stopped) return
        clearTimeout(timer)
        lastSeen = Date.now()
        const source = new EventSource(api + 'events')
        es = source
        source.onopen = () => {
          if (es !== source) return
          delay = 1000
          lastSeen = Date.now()
          h.onStatus('live')
          h.onReconnect() // resync after every (re)connect: changes may have been missed
        }
        source.onerror = () => {
          if (es !== source) return
          h.onStatus('offline') // shown as "Reconnecting…"
          // On a dropped stream the browser retries by itself; on an HTTP error (e.g. 503
          // while the database is down) it gives up, so retry with backoff.
          if (source.readyState === EventSource.CLOSED) {
            source.close()
            es = null
            retryLater()
          }
        }
        // The server sends `event: ping` every ~15 s, so a silent stream means a dead connection.
        source.addEventListener('ping', () => {
          if (es === source) lastSeen = Date.now()
        })
        source.onmessage = (e) => {
          if (es !== source) return
          lastSeen = Date.now()
          let msg: { op: string; id?: string; row?: Assignment; event?: HistoryEvent }
          try {
            msg = JSON.parse(e.data)
          } catch {
            return
          }
          if (msg.op === 'EVENT') {
            if (msg.event) h.onEvent(msg.event)
          } else if (msg.op === 'DELETE' && msg.id) h.onDelete(msg.id)
          else if (msg.row) h.onUpsert(msg.row)
        }
      }

      // The device lost its network: the stream may look open for minutes, so say so right away
      // and reconnect (→ onopen → resync) as soon as the network is back.
      const onOffline = () => restart()
      const onOnline = () => restart(true)
      window.addEventListener('offline', onOffline)
      window.addEventListener('online', onOnline)
      // Heartbeat watchdog: nothing for 35 s (two missed pings) → the stream is dead, reconnect.
      const watchdog = setInterval(() => {
        if (es && es.readyState === EventSource.OPEN && Date.now() - lastSeen > 35_000) restart(true)
      }, 5_000)

      h.onStatus('connecting')
      connect()
      return () => {
        stopped = true
        clearTimeout(timer)
        clearInterval(watchdog)
        window.removeEventListener('offline', onOffline)
        window.removeEventListener('online', onOnline)
        es?.close()
      }
    },

    async add(row) {
      await call('assignments', { method: 'POST', body: JSON.stringify(row) })
    },

    async move(id, patch) {
      await call(`assignments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    },

    async remove(id, by) {
      await call(`assignments/${id}`, { method: 'DELETE', body: JSON.stringify(by) })
    },
  }
}
