// Local-development backend: talks to the Vite dev API in server/pgDevApi.ts,
// which sits on a local PostgreSQL database. Live updates arrive over SSE.
import type { Assignment } from '../config/types'
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

    subscribe(h: SubscribeHandlers) {
      let es: EventSource | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      let delay = 1000
      let stopped = false

      const connect = () => {
        if (stopped) return
        const source = new EventSource(api + 'events')
        es = source
        source.onopen = () => {
          delay = 1000
          h.onStatus('live')
          h.onReconnect() // resync after every (re)connect: changes may have been missed
        }
        source.onerror = () => {
          h.onStatus('offline') // shown as "Reconnecting…"
          // On a dropped stream the browser retries by itself; on an HTTP error (e.g. 503
          // while the database is down) it gives up, so retry with backoff.
          if (source.readyState === EventSource.CLOSED) {
            source.close()
            timer = setTimeout(connect, delay)
            delay = Math.min(delay * 2, 10_000)
          }
        }
        source.onmessage = (e) => {
          let msg: { op: string; id?: string; row?: Assignment }
          try {
            msg = JSON.parse(e.data)
          } catch {
            return
          }
          if (msg.op === 'DELETE' && msg.id) h.onDelete(msg.id)
          else if (msg.row) h.onUpsert(msg.row)
        }
      }

      h.onStatus('connecting')
      connect()
      return () => {
        stopped = true
        clearTimeout(timer)
        es?.close()
      }
    },

    async add(row) {
      await call('assignments', { method: 'POST', body: JSON.stringify(row) })
    },

    async move(id, patch) {
      await call(`assignments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    },

    async remove(id) {
      await call(`assignments/${id}`, { method: 'DELETE' })
    },
  }
}
