export type Mode = 'LIVE' | 'PLAYBACK'
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export interface Operator {
  id: string
  name: string
  color: string
}

export interface GatheringType {
  id: string
  name: string
  /** 1–3 letter monogram for the gathering icon (e.g. "PM"); defaults to the name's initials */
  short?: string
  color: string
  order: number
}

export interface Schedule {
  id: string
  gatheringTypeId: string
  mode: Mode
  day: Day
  time: string // HH:mm, 24-hour
  order: number
}

export interface ScheduleConfig {
  title: string
  month: string
  instructions: string
  gatheringTypes: GatheringType[]
  schedules: Schedule[]
}

export interface OperatorsConfig {
  operators: Operator[]
}

/** A placed sticky (one row of the `assignments` table). */
export interface Assignment {
  id: string
  operator_id: string
  schedule_id: string
  moved_by: string
  /** Work email of whoever last placed / moved it (absent on rows saved before emails were required). */
  moved_by_email?: string | null
  client_id: string
  moved_at: string // ISO timestamp
}

export type HistoryAction = 'add' | 'move' | 'remove'

/** One paper-trail entry (a row of the append-only `assignment_events` table). */
export interface HistoryEvent {
  id: number
  at: string // ISO timestamp
  action: HistoryAction
  assignment_id: string
  operator_id: string
  from_schedule_id: string | null
  to_schedule_id: string | null
  /** Nickname of whoever made the change; null when unknown. */
  actor: string | null
  /** Their work email; null / absent when unknown (older entries). */
  actor_email?: string | null
  client_id: string | null
}
