import type { Schedule } from '../config/types'

/** "03:30" → "3:30 AM", "17:30" → "5:30 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function whenLabel(s: Schedule): string {
  return `${s.day} ${formatTime(s.time)}`
}

export function modeLabel(s: Schedule): string {
  return s.mode === 'LIVE' ? 'LIVE' : 'PLAYBACK'
}

export function scheduleLabel(s: Schedule): string {
  return `${modeLabel(s)} ${whenLabel(s)}`
}

export function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (diff < 45) return 'just now'
  const min = Math.round(diff / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  return `${d}d ago`
}

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Fallback for older browsers / insecure contexts (e.g. LAN IP over http on a phone)
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
