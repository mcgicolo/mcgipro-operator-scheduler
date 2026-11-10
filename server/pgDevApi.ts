// Dev-only Vite plugin: a tiny REST + Server-Sent-Events API over a local
// PostgreSQL database, so `npm run dev:pg` works without Supabase.
// Never part of the production build (configureServer only runs in `vite dev`).
//
//   GET    <base>api/assignments        → Assignment[]
//   POST   <base>api/assignments        → 201 | 400 invalid | 409 duplicate
//   PATCH  <base>api/assignments/:id    → 204 | 400 invalid | 404 not found
//   DELETE <base>api/assignments/:id    → 204   (optional body {actor, actor_email, client_id} for the paper trail)
//   GET    <base>api/history?limit&before → HistoryEvent[] newest first (paper trail)
//   GET    <base>api/events             → text/event-stream of {op,row|id|event} (+ `event: ping` every 15 s)
//
// Errors are JSON {code: 'duplicate' | 'not_found' | 'other', message}; 503 means
// the database is unreachable or not set up (the message says how to fix it).
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const COLUMNS = 'id, operator_id, schedule_id, moved_by, moved_by_email, client_id, moved_at'
const EVENT_COLUMNS = 'id, at, action, assignment_id, operator_id, from_schedule_id, to_schedule_id, actor, actor_email, client_id'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/i
const MAX_BODY = 10_000

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > MAX_BODY) {
      req.resume() // drain so the response can still be delivered
      return reject(new ApiError(413, 'Request body too large'))
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) reject(new ApiError(413, 'Request body too large'))
      else chunks.push(c)
    })
    req.on('end', () => {
      if (size > MAX_BODY) return
      let v: unknown
      try {
        v = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
      } catch {
        return reject(new ApiError(400, 'Body is not valid JSON'))
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) resolve(v as Record<string, unknown>)
      else reject(new ApiError(400, 'Body must be a JSON object'))
    })
    req.on('error', reject)
    req.on('close', () => reject(new ApiError(400, 'Request aborted'))) // no-op once settled
  })
}

/** Throws a 400 naming the first field that doesn't match the Assignment shape. */
function check(b: Record<string, unknown>, fields: string[]) {
  const bad = (f: string, why: string) => {
    throw new ApiError(400, `Invalid ${f}: ${why}`)
  }
  for (const f of fields) {
    const v = b[f]
    if (f === 'id' || f === 'operator_id' || f === 'schedule_id') {
      if (typeof v !== 'string' || !UUID_RE.test(v)) bad(f, 'expected a uuid')
    } else if (f === 'moved_by' || f === 'client_id') {
      const max = f === 'moved_by' ? 60 : 64
      if (typeof v !== 'string' || !v.trim()) bad(f, 'expected a non-empty string')
      else if ([...v].length > max) bad(f, `at most ${max} characters`)
    } else if (f === 'moved_by_email') {
      // Optional (older clients don't send it).
      if (v != null && (typeof v !== 'string' || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))) bad(f, 'expected an email')
    } else if (f === 'moved_at') {
      if (typeof v !== 'string' || !ISO_RE.test(v) || Number.isNaN(Date.parse(v))) bad(f, 'expected an ISO timestamp')
    }
  }
}

function send(res: ServerResponse, status: number, data?: unknown) {
  if (res.headersSent) return void res.end()
  res.statusCode = status
  if (data === undefined) return void res.end()
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/** A fix-it message when the database is unreachable or not set up, else null. */
function unavailable(err: unknown): string | null {
  const e = err as { code?: string; message?: string }
  const msg = e.message || e.code || 'unknown error'
  if (e.code === '3D000') return `${msg} — run \`npm run db:setup\` (or point DATABASE_URL at an existing database)`
  if (e.code === '42P01' || e.code === '42883') return `${msg} — schema missing: run \`npm run db:setup\``
  if (e.code === '28P01' || e.code === '28000') return `${msg} — check DATABASE_URL`
  if (
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOENT', '57P03'].includes(e.code ?? '') ||
    /timeout/i.test(msg)
  )
    return `cannot reach PostgreSQL (${msg}) — is it running? \`brew services start postgresql@18\``
  return null
}

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof ApiError) return send(res, err.status, { code: 'other', message: err.message })
  const e = err as { code?: string; message?: string }
  if (e.code === '23505') return send(res, 409, { code: 'duplicate', message: 'Already in this duty' })
  if (e.code?.startsWith('22') || e.code?.startsWith('23')) return send(res, 400, { code: 'other', message: e.message })
  if (e.code === 'P0001') return send(res, 429, { code: 'other', message: e.message })
  const hint = unavailable(err)
  if (hint) return send(res, 503, { code: 'other', message: hint })
  console.error('[pg-dev-api]', e.message)
  return send(res, 500, { code: 'other', message: e.message || 'Database error' })
}

/** Serialise timestamps the same way for REST and NOTIFY rows (the store sorts moved_at as a string). */
function iso(t: unknown) {
  const d = t instanceof Date ? t : typeof t === 'string' ? new Date(t) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : t
}
function toRow(r: Record<string, unknown>) {
  return { ...r, moved_at: iso(r.moved_at) }
}
/** Paper-trail row: bigint id as a number, ISO timestamp. */
function toEvent(r: Record<string, unknown>) {
  return { ...r, id: Number(r.id), at: iso(r.at) }
}

/** Optional short string from a JSON body (actor / client_id), else null. */
function optText(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? [...v.trim()].slice(0, max).join('') : null
}

export function pgDevApi(databaseUrl: string | undefined, base: string): Plugin {
  return {
    name: 'pg-dev-api',
    apply: 'serve',
    async configureServer(server) {
      const log = server.config.logger
      const prefix = `${base}api/`

      if (!databaseUrl) {
        if (server.config.env.VITE_BACKEND !== 'postgres') return
        const message = 'DATABASE_URL is not set — add it to .env.pg (see .env.example)'
        log.error(`[pg-dev-api] ${message}`)
        server.middlewares.use((req, res, next) =>
          req.url?.startsWith(prefix) ? send(res, 503, { code: 'other', message }) : next(),
        )
        return
      }

      const { default: pg } = await import('pg')
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 5000 })
      // An idle client dying (DB restart, terminated backend) must not crash Vite.
      pool.on('error', (e) => log.warn(`[pg-dev-api] pool: ${e.message}`))

      let dbName = 'database'
      try {
        dbName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) || dbName
      } catch {
        /* non-URL connection string */
      }

      const clients = new Set<ServerResponse>()
      let listening = false
      let closed = false
      let lastError = ''
      let retry: ReturnType<typeof setTimeout> | undefined
      let listener: InstanceType<typeof pg.Client> | null = null

      // One dedicated LISTEN connection, re-established if it drops. SSE clients
      // are only accepted while it is up, so a (re)connected EventSource — whose
      // onopen triggers a refetch — never misses a change.
      const listen = async () => {
        if (closed) return
        const l = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 })
        listener = l
        let ready = false // until LISTEN succeeds, failures surface as rejections below
        let done = false
        const fail = (e: Error) => {
          if (done) return // 'error' and 'end' both fire on a lost connection
          done = true
          listening = false
          listener = null
          l.removeAllListeners('notification')
          l.end().catch(() => {})
          for (const c of clients) c.end() // clients reconnect + refetch
          clients.clear()
          if (closed) return
          const msg = unavailable(e) ?? e.message
          if (msg !== lastError) log.error(`[pg-dev-api] LISTEN: ${msg} (retrying)`)
          lastError = msg
          retry = setTimeout(listen, 1000)
        }
        l.on('error', fail)
        l.on('end', () => ready && fail(new Error('connection closed')))
        l.on('notification', (n) => {
          if (!n.payload) return
          try {
            const msg = JSON.parse(n.payload) as { op: string; row?: Record<string, unknown>; event?: Record<string, unknown> }
            if (msg.row) msg.row = toRow(msg.row)
            if (msg.event) msg.event = toEvent(msg.event)
            const frame = `data: ${JSON.stringify(msg)}\n\n`
            for (const c of clients) c.write(frame)
          } catch (e) {
            log.warn(`[pg-dev-api] bad notification: ${(e as Error).message}`)
          }
        })
        try {
          await l.connect()
          await l.query('select from assignments limit 0') // schema present? (else 503 + hint)
          await l.query('LISTEN assignments')
        } catch (e) {
          return fail(e as Error)
        }
        if (done) return
        ready = listening = true
        log.info(`  ➜  pg dev API: LISTEN on ${dbName}${lastError ? ' (reconnected)' : ''}`)
        lastError = ''
      }
      void listen()

      server.httpServer?.on('close', () => {
        closed = true
        clearTimeout(retry)
        for (const c of clients) c.end()
        void listener?.end().catch(() => {})
        void pool.end().catch(() => {})
      })

      const handle = async (req: IncomingMessage, res: ServerResponse) => {
        const path = (req.url?.split('?')[0] ?? '').slice(prefix.length)

        if (path === 'events' && req.method === 'GET') {
          if (!listening) {
            // EventSource treats this as fatal; the client retries with backoff.
            return send(res, 503, {
              code: 'other',
              message: lastError || 'Live updates are starting, try again shortly',
            })
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write('retry: 1500\n: connected\n\n')
          clients.add(res)
          // A named event (not a `:` comment) so the client's EventSource sees it: no ping for
          // ~35 s tells the client the stream is dead and it reconnects (src/api/postgres.ts).
          const ping = setInterval(() => res.write('event: ping\ndata: 1\n\n'), 15_000)
          req.on('close', () => {
            clearInterval(ping)
            clients.delete(res)
          })
          return
        }

        if (path === 'history' && req.method === 'GET') {
          const q = new URLSearchParams(req.url?.split('?')[1] ?? '')
          const limit = Math.min(Math.max(Number(q.get('limit')) || 50, 1), 200)
          const before = q.get('before')
          if (before !== null && !/^\d+$/.test(before)) return send(res, 400, { code: 'other', message: 'Invalid before: expected an id' })
          const { rows } = await pool.query(
            `select ${EVENT_COLUMNS} from assignment_events where ($1::bigint is null or id < $1) order by id desc limit $2`,
            [before, limit],
          )
          return send(res, 200, rows.map(toEvent))
        }

        const [collection, id, extra] = path.split('/')
        if (collection !== 'assignments' || extra !== undefined) return send(res, 404, { code: 'other', message: 'Not found' })
        if (id !== undefined && !UUID_RE.test(id)) return send(res, 400, { code: 'other', message: 'Invalid id: expected a uuid' })

        if (req.method === 'GET' && !id) {
          const { rows } = await pool.query(`select ${COLUMNS} from assignments`)
          return send(res, 200, rows.map(toRow))
        }
        if (req.method === 'POST' && !id) {
          const b = await readJson(req)
          // id and moved_at are optional (DB defaults), like a Supabase insert.
          check(b, ['operator_id', 'schedule_id', 'moved_by', 'moved_by_email', 'client_id'])
          if (b.id != null) check(b, ['id'])
          if (b.moved_at != null) check(b, ['moved_at'])
          await pool.query(
            `insert into assignments (${COLUMNS})
             values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()))`,
            [b.id ?? null, b.operator_id, b.schedule_id, b.moved_by, b.moved_by_email ?? null, b.client_id, b.moved_at ?? null],
          )
          return send(res, 201)
        }
        if (req.method === 'PATCH' && id) {
          const b = await readJson(req)
          check(b, ['schedule_id', 'moved_by', 'moved_by_email', 'client_id', 'moved_at'])
          const { rowCount } = await pool.query(
            `update assignments set schedule_id = $2, moved_by = $3, moved_by_email = $4, client_id = $5, moved_at = $6 where id = $1`,
            [id, b.schedule_id, b.moved_by, b.moved_by_email ?? null, b.client_id, b.moved_at],
          )
          return rowCount ? send(res, 204) : send(res, 404, { code: 'not_found', message: 'That sticky was already removed' })
        }
        if (req.method === 'DELETE' && id) {
          // Through remove_assignment() so the paper trail records who removed it.
          const b = await readJson(req)
          await pool.query('select remove_assignment($1, $2, $3, $4)', [
            id,
            optText(b.actor, 60),
            optText(b.actor_email, 254),
            optText(b.client_id, 64),
          ])
          return send(res, 204)
        }
        return send(res, 405, { code: 'other', message: 'Method not allowed' })
      }

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next()
        // Errors must become responses: an unhandled rejection would kill Vite.
        handle(req, res).catch((e) => sendError(res, e))
      })
    },
  }
}
