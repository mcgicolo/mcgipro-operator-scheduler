import type { Assignment } from '../config/types'

export type BackendKind = 'supabase' | 'local'
export type ConnectionStatus = 'connecting' | 'live' | 'offline'

export interface SubscribeHandlers {
  onUpsert(row: Assignment): void
  onDelete(id: string): void
  /** Called when the realtime channel (re)connects — the store refetches to resync. */
  onReconnect(): void
  onStatus(status: ConnectionStatus): void
}

export interface Backend {
  kind: BackendKind
  fetchAll(): Promise<Assignment[]>
  subscribe(handlers: SubscribeHandlers): () => void
  add(row: Assignment): Promise<void>
  move(id: string, patch: Pick<Assignment, 'schedule_id' | 'moved_by' | 'client_id' | 'moved_at'>): Promise<void>
  remove(id: string): Promise<void>
}

export class BackendError extends Error {
  constructor(
    message: string,
    public code: 'duplicate' | 'not_found' | 'other' = 'other',
  ) {
    super(message)
  }
}
