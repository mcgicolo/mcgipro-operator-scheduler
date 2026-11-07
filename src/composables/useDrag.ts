// Small pointer-driven drag & drop engine.
//
// Why not SortableJS: the board's columns are *derived* lists (computed from the
// assignments table), and Sortable mutates the DOM itself, which fights Vue's
// rendering — especially in "clone from palette" mode. This engine never moves real
// nodes: it floats a visual clone of the grabbed sticky (same size, shape and colour,
// held at the same grab point), resolves the drop target with elementFromPoint, and
// lets the store decide what happens.
//
// Gestures
//  - Touch, anywhere: long-press (~200ms without moving) picks the sticky up, so
//    normal scrolling still works.
//  - Touch, in the phone tray: swipe left/right scrolls the tray (when it overflows);
//    pulling a name up or diagonally out picks it up immediately (no long-press).
//  - Mouse: moving 4px picks it up. In the phone tray a sideways drag scrolls the tray.
//  - Plain taps fall through to `click`.
import { reactive } from 'vue'

export interface DragPayload {
  operatorId: string
  assignmentId: string | null // null = copy from palette
  fromScheduleId: string | null
  name: string
  color: string
}

export type DropTarget = { kind: 'schedule'; id: string } | { kind: 'remove' } | null

export const drag = reactive({
  active: false,
  payload: null as DragPayload | null,
  x: 0,
  y: 0,
  over: null as DropTarget,
  /** schedule id that just rejected a drop (drives the shake animation) */
  rejected: null as string | null,
})

type DropHandler = (p: DragPayload, t: DropTarget) => 'ok' | 'reject' | 'none'
let onDrop: DropHandler = () => 'none'
export function setDropHandler(fn: DropHandler) {
  onDrop = fn
}

const LONG_PRESS_MS = 200
const TOUCH_SLOP = 8
const MOUSE_SLOP = 4
const EDGE = 64 // horizontal grid auto-scroll zone, and the max vertical zone
// The vertical auto-scroll zone scales with the band between the sticky top bar and
// the bottom tray, so a short phone-landscape band still leaves room to aim at a duty.
const EDGE_MIN = 24
const EDGE_RATIO = 0.18
// The pointer must rest in a zone this long before the page scrolls; the speed then
// eases in over RAMP_MS (and with depth into the zone) to MAX_SPEED px per 60fps frame.
const DWELL_MS = 300
const RAMP_MS = 600
const MAX_SPEED = 16

let suppressClickUntil = 0
/** Returns true if this click is the tail of a drag/swipe and should be ignored. */
export function clickSuppressed(): boolean {
  return Date.now() < suppressClickUntil
}
const suppressClick = () => (suppressClickUntil = Date.now() + 350)

function targetAt(x: number, y: number): DropTarget {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
  if (!el) return null
  const v = el.dataset.drop!
  if (v === 'remove') return { kind: 'remove' }
  if (v.startsWith('schedule:')) return { kind: 'schedule', id: v.slice(9) }
  return null
}

/** The horizontally scrolling tray list, if `el` sits in the phone bottom tray. */
function trayListOf(el: HTMLElement): HTMLElement | null {
  const tray = el.closest<HTMLElement>('[data-bottom-overlay]')
  if (!tray || getComputedStyle(tray).position !== 'fixed') return null
  const list = el.closest<HTMLElement>('.list')
  return list && list.scrollWidth > list.clientWidth ? list : null
}

// ---- floating clone ("ghost") that looks exactly like the grabbed sticky

let ghost: HTMLElement | null = null
let grabX = 0
let grabY = 0

function makeGhost(src: HTMLElement, x: number, y: number) {
  const r = src.getBoundingClientRect()
  const g = src.cloneNode(true) as HTMLElement
  g.classList.remove('lifted')
  g.removeAttribute('tabindex')
  g.removeAttribute('role')
  g.setAttribute('aria-hidden', 'true')
  grabX = x - r.left
  grabY = y - r.top
  Object.assign(g.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${r.width}px`,
    height: `${r.height}px`,
    maxWidth: 'none',
    margin: '0',
    zIndex: '200',
    pointerEvents: 'none',
    transition: 'box-shadow 0.2s ease',
    willChange: 'transform',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.26), 0 3px 8px rgba(0, 0, 0, 0.12)',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(g)
  ghost = g
  placeGhost(x, y)
}

function placeGhost(x: number, y: number) {
  if (ghost) ghost.style.transform = `translate3d(${x - grabX}px, ${y - grabY}px, 0) scale(1.04)`
}

function removeGhost() {
  ghost?.remove()
  ghost = null
}

// ---- auto-scroll near the edges. An edge only becomes "armed" once the pointer
// has been away from it, so dragging up out of the tray doesn't scroll the page.

let raf = 0
const armed = { top: false, bottom: false }
/** Which vertical zone the pointer is resting in, and since when (rAF time). */
let zone: 'top' | 'bottom' | null = null
let zoneSince = 0
let lastFrame = 0
let carry = 0 // sub-pixel scroll remainder

const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v))

function resetAutoScroll() {
  armed.top = false
  armed.bottom = false
  zone = null
  zoneSince = 0
  lastFrame = 0
  carry = 0
}

function autoScrollLoop(now: number) {
  raf = 0
  if (!drag.active) return
  const dt = lastFrame ? Math.min(now - lastFrame, 50) : 16.7
  lastFrame = now
  const { x, y } = drag
  let top = 0
  document.querySelectorAll<HTMLElement>('[data-top-overlay]').forEach((el) => {
    const pos = getComputedStyle(el).position
    if (pos === 'sticky' || pos === 'fixed') top = Math.max(top, el.getBoundingClientRect().bottom)
  })
  const tray = document.querySelector<HTMLElement>('[data-bottom-overlay]')
  const bottom = tray && getComputedStyle(tray).position === 'fixed' ? tray.getBoundingClientRect().top : innerHeight

  const edge = clamp(EDGE_MIN, (bottom - top) * EDGE_RATIO, EDGE)

  if (y > top + edge) armed.top = true
  if (y < bottom - edge) armed.bottom = true

  let inZone: typeof zone = null
  let depth = 0 // 0 at the inner border of the zone, 1 at the overlay edge
  if (drag.over?.kind !== 'remove') {
    if (armed.top && y < top + edge) {
      inZone = 'top'
      depth = clamp(0, (top + edge - y) / edge, 1)
    } else if (armed.bottom && y > bottom - edge && y < bottom) {
      inZone = 'bottom'
      depth = clamp(0, (y - (bottom - edge)) / edge, 1)
    }
  }
  if (inZone !== zone) {
    zone = inZone
    zoneSince = now
    carry = 0
  }

  let dy = 0
  if (zone && now - zoneSince >= DWELL_MS) {
    // Ease in (quadratic) so a brief rest near the edge only nudges the page.
    const ramp = clamp(0.05, (now - zoneSince - DWELL_MS) / RAMP_MS, 1) ** 2
    const speed = MAX_SPEED * (0.15 + 0.85 * depth * depth) * ramp // px per 60fps frame
    carry += speed * (dt / 16.7) * (zone === 'top' ? -1 : 1)
    dy = Math.trunc(carry)
    carry -= dy
  }
  if (dy) window.scrollBy(0, dy)

  const grid = document.querySelector<HTMLElement>('.groups')
  let dx = 0
  if (grid && grid.scrollWidth > grid.clientWidth) {
    const r = grid.getBoundingClientRect()
    if (y > r.top && y < r.bottom) {
      if (x < r.left + EDGE && x > r.left - 10) dx = -12
      else if (x > r.right - EDGE && x < r.right + 10) dx = 12
    }
    if (dx) grid.scrollLeft += dx
  }
  if (dx || dy) drag.over = targetAt(x, y)
  raf = requestAnimationFrame(autoScrollLoop)
}

function begin(p: DragPayload, src: HTMLElement, x: number, y: number) {
  drag.payload = p
  drag.active = true
  drag.x = x
  drag.y = y
  resetAutoScroll()
  makeGhost(src, x, y)
  drag.over = targetAt(x, y)
  document.documentElement.classList.add('dragging')
  navigator.vibrate?.(12)
  if (!raf) raf = requestAnimationFrame(autoScrollLoop)
}

function moveTo(x: number, y: number) {
  drag.x = x
  drag.y = y
  placeGhost(x, y)
  drag.over = targetAt(x, y)
}

function finish(cancelled = false) {
  if (!drag.active || !drag.payload) return
  const p = drag.payload
  const t = cancelled ? null : targetAt(drag.x, drag.y)
  removeGhost()
  drag.active = false
  drag.payload = null
  drag.over = null
  document.documentElement.classList.remove('dragging')
  suppressClick()
  const res = onDrop(p, t)
  if (res === 'reject' && t?.kind === 'schedule') {
    drag.rejected = t.id
    navigator.vibrate?.([30, 40, 30])
    setTimeout(() => {
      if (drag.rejected === t.id) drag.rejected = null
    }, 450)
  }
}

/** Attach to a sticky: `v-on="draggable(() => payload)"`. */
export function draggable(getPayload: () => DragPayload) {
  return {
    mousedown(e: MouseEvent) {
      if (e.button !== 0) return
      const el = e.currentTarget as HTMLElement
      const list = trayListOf(el)
      const sx = e.clientX
      const sy = e.clientY
      const startScroll = list?.scrollLeft ?? 0
      let mode: 'idle' | 'drag' | 'swipe' = 'idle'

      const move = (ev: MouseEvent) => {
        const dx = ev.clientX - sx
        const dy = ev.clientY - sy
        if (mode === 'idle') {
          if (Math.hypot(dx, dy) < MOUSE_SLOP) return
          if (list && Math.abs(dx) > Math.abs(dy)) {
            mode = 'swipe'
            list.style.scrollSnapType = 'none'
          } else {
            mode = 'drag'
            begin(getPayload(), el, ev.clientX, ev.clientY)
          }
        }
        ev.preventDefault()
        if (mode === 'swipe' && list) list.scrollLeft = startScroll - dx
        else moveTo(ev.clientX, ev.clientY)
      }
      const up = () => {
        removeEventListener('mousemove', move)
        removeEventListener('mouseup', up)
        if (mode === 'swipe' && list) {
          list.style.scrollSnapType = ''
          suppressClick()
        } else if (mode === 'drag') finish()
      }
      addEventListener('mousemove', move)
      addEventListener('mouseup', up)
    },

    touchstart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      const el = e.currentTarget as HTMLElement
      const tray = el.closest<HTMLElement>('[data-bottom-overlay]')
      // Pull-up shortcut only in the collapsed one-row tray; the expanded grid scrolls vertically.
      const inTray = !!tray && getComputedStyle(tray).position === 'fixed' && !tray.classList.contains('expanded')
      // Only a tray that can actually scroll sideways needs to tell swipes from pulls.
      const list = inTray ? el.closest<HTMLElement>('.list') : null
      const trayScrollsX = !!list && list.scrollWidth > list.clientWidth + 1
      const t0 = e.touches[0]
      const sx = t0.clientX
      const sy = t0.clientY
      let lx = sx
      let ly = sy
      let started = false
      const start = () => {
        if (started) return
        started = true
        clearTimeout(timer)
        begin(getPayload(), el, lx, ly)
      }
      const timer = setTimeout(start, LONG_PRESS_MS)

      const move = (ev: TouchEvent) => {
        const t = ev.touches[0]
        lx = t.clientX
        ly = t.clientY
        if (!started) {
          const dx = lx - sx
          const dy = ly - sy
          if (Math.hypot(dx, dy) <= TOUCH_SLOP) return
          // Tray: pulling a name out picks it up straight away. If the tray scrolls
          // sideways, only a clearly upward pull (steeper than ~27°) counts, so horizontal
          // swipes — even ones drifting slightly up — still scroll it; if it doesn't, any
          // clear movement (e.g. a diagonal pull toward a duty) drags.
          const pull = !trayScrollsX || (dy < 0 && Math.abs(dy) > 0.5 * Math.abs(dx))
          if (inTray && pull) {
            ev.preventDefault()
            start()
          } else {
            // Sideways in the tray, or any scroll elsewhere: let the browser scroll.
            cleanup()
            return
          }
        }
        ev.preventDefault() // stop the page from scrolling while dragging
        moveTo(lx, ly)
      }
      const end = (ev: TouchEvent) => {
        const wasStarted = started
        cleanup()
        if (wasStarted) {
          ev.preventDefault() // no synthetic click after a drag
          finish(ev.type === 'touchcancel')
        }
      }
      const cleanup = () => {
        clearTimeout(timer)
        removeEventListener('touchmove', move)
        removeEventListener('touchend', end)
        removeEventListener('touchcancel', end)
      }
      addEventListener('touchmove', move, { passive: false })
      addEventListener('touchend', end)
      addEventListener('touchcancel', end)
    },

    contextmenu(e: Event) {
      // Android long-press would otherwise open the context menu.
      e.preventDefault()
    },
  }
}

/**
 * Lets a mouse drag on the tray's empty space scroll it sideways (touch already
 * swipes natively). Attach with `v-on="swipeScroll"` on the scroll container.
 */
export const swipeScroll = {
  mousedown(e: MouseEvent) {
    const list = e.currentTarget as HTMLElement
    const canX = list.scrollWidth > list.clientWidth
    const canY = list.scrollHeight > list.clientHeight
    if (e.button !== 0 || e.target !== list || (!canX && !canY)) return
    const sx = e.clientX
    const sy = e.clientY
    const startLeft = list.scrollLeft
    const startTop = list.scrollTop
    let moved = false
    list.style.scrollSnapType = 'none'
    const move = (ev: MouseEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > MOUSE_SLOP) moved = true
      if (canX) list.scrollLeft = startLeft - (ev.clientX - sx)
      if (canY) list.scrollTop = startTop - (ev.clientY - sy)
      ev.preventDefault()
    }
    const up = () => {
      removeEventListener('mousemove', move)
      removeEventListener('mouseup', up)
      list.style.scrollSnapType = ''
      if (moved) suppressClick()
    }
    addEventListener('mousemove', move)
    addEventListener('mouseup', up)
  },
}
