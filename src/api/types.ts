import type { Assignment, HistoryEvent } from '../config/types'

export type BackendKind = 'supabase' | 'postgres' | 'local'
export type ConnectionStatus = 'connecting' | 'live' | 'offline'

export interface SubscribeHandlers {
  onUpsert(row: Assignment): void
  onDelete(id: string): void
  /** A new paper-trail entry (any device, including this one). */
  onEvent(event: HistoryEvent): void
  /** Called when the realtime channel (re)connects — the store refetches to resync. */
  onReconnect(): void
  onStatus(status: ConnectionStatus): void
}

/** Who made a change, recorded in the paper trail. */
export interface Actor {
  actor: string
  client_id: string
}

export interface Backend {
  kind: BackendKind
  fetchAll(): Promise<Assignment[]>
  /** Paper trail, newest first; `beforeId` pages back from an entry. */
  fetchHistory(opts: { beforeId?: number; limit: number }): Promise<HistoryEvent[]>
  subscribe(handlers: SubscribeHandlers): () => void
  add(row: Assignment): Promise<void>
  move(id: string, patch: Pick<Assignment, 'schedule_id' | 'moved_by' | 'client_id' | 'moved_at'>): Promise<void>
  remove(id: string, by: Actor): Promise<void>
}

export class BackendError extends Error {
  constructor(
    message: string,
    public code: 'duplicate' | 'not_found' | 'unavailable' | 'other' = 'other',
  ) {
    super(message)
  }
}
