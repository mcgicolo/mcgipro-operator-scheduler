// Shared by the app (error banner) and scripts/validate-config.ts (deploy gate).
// Keep this file free of browser/Node-only APIs.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR_RE = /^#[0-9a-f]{6}$/i
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MODES = ['LIVE', 'PLAYBACK']

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function validateConfig(schedule: unknown, operators: unknown): string[] {
  const errors: string[] = []
  const seen = new Map<string, string>()

  const checkId = (id: unknown, where: string) => {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      errors.push(`${where}: "id" must be a valid UUID (got ${JSON.stringify(id)})`)
      return
    }
    const key = id.toLowerCase()
    const prev = seen.get(key)
    if (prev) errors.push(`${where}: duplicate id ${id} (already used by ${prev})`)
    else seen.set(key, where)
  }

  // ---- schedule.json ----
  if (!isObj(schedule)) {
    errors.push('schedule.json: must be a JSON object')
  } else {
    for (const k of ['title', 'month'] as const) {
      if (!isStr(schedule[k])) errors.push(`schedule.json: "${k}" must be a non-empty string`)
    }
    if (schedule.instructions !== undefined && typeof schedule.instructions !== 'string') {
      errors.push('schedule.json: "instructions" must be a string')
    }

    const gtIds = new Set<string>()
    if (!Array.isArray(schedule.gatheringTypes)) {
      errors.push('schedule.json: "gatheringTypes" must be an array')
    } else {
      schedule.gatheringTypes.forEach((g, i) => {
        const where = `schedule.json gatheringTypes[${i}]`
        if (!isObj(g)) return errors.push(`${where}: must be an object`)
        checkId(g.id, where)
        if (typeof g.id === 'string') gtIds.add(g.id.toLowerCase())
        if (!isStr(g.name)) errors.push(`${where}: "name" must be a non-empty string`)
        if (g.short !== undefined && (typeof g.short !== 'string' || !/^[\p{L}\p{N}]{1,3}$/u.test(g.short))) {
          errors.push(`${where}: "short" must be 1–3 letters/digits (e.g. "PM")`)
        }
        if (typeof g.color !== 'string' || !COLOR_RE.test(g.color)) errors.push(`${where}: "color" must be a #RRGGBB hex color`)
        if (!isNum(g.order)) errors.push(`${where}: "order" must be a number`)
      })
    }

    if (!Array.isArray(schedule.schedules)) {
      errors.push('schedule.json: "schedules" must be an array')
    } else {
      schedule.schedules.forEach((s, i) => {
        const where = `schedule.json schedules[${i}]`
        if (!isObj(s)) return errors.push(`${where}: must be an object`)
        checkId(s.id, where)
        if (typeof s.gatheringTypeId !== 'string' || !gtIds.has(s.gatheringTypeId.toLowerCase())) {
          errors.push(`${where}: "gatheringTypeId" ${JSON.stringify(s.gatheringTypeId)} does not match any gathering type`)
        }
        if (typeof s.mode !== 'string' || !MODES.includes(s.mode)) errors.push(`${where}: "mode" must be LIVE or PLAYBACK`)
        if (typeof s.day !== 'string' || !DAYS.includes(s.day)) errors.push(`${where}: "day" must be one of ${DAYS.join(', ')}`)
        if (typeof s.time !== 'string' || !TIME_RE.test(s.time)) errors.push(`${where}: "time" must be 24-hour HH:mm`)
        if (!isNum(s.order)) errors.push(`${where}: "order" must be a number`)
      })
    }
  }

  // ---- operators.json ----
  if (!isObj(operators) || !Array.isArray(operators.operators)) {
    errors.push('operators.json: must be an object with an "operators" array')
  } else {
    operators.operators.forEach((o, i) => {
      const where = `operators.json operators[${i}]`
      if (!isObj(o)) return errors.push(`${where}: must be an object`)
      checkId(o.id, where)
      if (!isStr(o.name)) errors.push(`${where}: "name" must be a non-empty string`)
      if (typeof o.color !== 'string' || !COLOR_RE.test(o.color)) errors.push(`${where}: "color" must be a #RRGGBB hex color`)
    })
  }

  return errors
}
