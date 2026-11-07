// Paper trail: who added, moved or removed which sticky, newest first.
// The first page loads with the board (so the History button can show a "new changes"
// badge), later entries arrive live, and older ones load on demand.
import { computed, reactive } from 'vue'
import type { HistoryEvent } from '../config/types'
import { BackendError, type Backend } from '../api'

const PAGE = 50
const LS_SEEN = 'historySeenId'

interface HistoryState {
  /** Newest first, unique by id. */
  events: HistoryEvent[]
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable'
  error: string
  hasMore: boolean
  loadingMore: boolean
  /** Newest entry this device has looked at; entries by others above it count as new. */
  seenId: number | null
}

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
    /* private mode: keep it in memory */
  }
}

const storedSeen = lsGet(LS_SEEN)

export const history = reactive<HistoryState>({
  events: [],
  status: 'idle',
  error: '',
  hasMore: false,
  loadingMore: false,
  seenId: storedSeen !== null && /^\d+$/.test(storedSeen) ? Number(storedSeen) : null,
})

let backend: Backend | null = null
let myClientId = ''

export function attachHistory(b: Backend, clientId: string) {
  backend = b
  myClientId = clientId
}

/** Changes by other people this device hasn't seen yet (the History button's badge). */
export const unreadCount = computed(() => {
  const seen = history.seenId
  if (seen === null) return 0
  let n = 0
  for (const e of history.events) {
    if (e.id <= seen) break
    if (e.client_id !== myClientId) n++
  }
  return n
})

export const isMine = (e: HistoryEvent) => !!e.client_id && e.client_id === myClientId

function merge(incoming: HistoryEvent[]) {
  if (!incoming.length) return
  const byId = new Map(history.events.map((e) => [e.id, e]))
  for (const e of incoming) byId.set(e.id, e)
  history.events = [...byId.values()].sort((a, b) => b.id - a.id)
}

/** Loads (or refreshes) the newest page. Safe to call on every reconnect. */
export async function refreshHistory() {
  if (!backend) return
  const first = history.status === 'idle' || history.status === 'error' || history.status === 'unavailable'
  if (first) history.status = 'loading'
  try {
    const page = await backend.fetchHistory({ limit: PAGE })
    if (first) history.hasMore = page.length === PAGE
    merge(page)
    history.status = 'ready'
    history.error = ''
    // First visit ever: everything so far counts as seen; only later changes get a badge.
    if (history.seenId === null) markHistorySeen()
  } catch (e) {
    if (!first) return // keep showing what we have; the next reconnect tries again
    const err = e as BackendError
    history.status = err.code === 'unavailable' ? 'unavailable' : 'error'
    history.error = err.message
  }
}

export async function loadMoreHistory() {
  const last = history.events.at(-1)
  if (!backend || !last || !history.hasMore || history.loadingMore) return
  history.loadingMore = true
  try {
    const page = await backend.fetchHistory({ beforeId: last.id, limit: PAGE })
    history.hasMore = page.length === PAGE
    merge(page)
  } catch (e) {
    history.error = (e as Error).message
  } finally {
    history.loadingMore = false
  }
}

/** A live entry from the realtime channel. */
export function receiveHistoryEvent(e: HistoryEvent) {
  if (history.status === 'unavailable') history.status = 'ready'
  merge([e])
}

export function markHistorySeen() {
  const newest = history.events[0]?.id ?? 0
  if (history.seenId !== null && newest <= history.seenId) return
  history.seenId = newest
  lsSet(LS_SEEN, String(newest))
}
