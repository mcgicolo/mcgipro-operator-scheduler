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
//  - Touch, in the phone tray: swipe left/right scrolls the tray; pulling a name
//    upward picks it up immediately (no long-press needed).
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
const EDGE = 64

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

function autoScrollLoop() {
  raf = 0
  if (!drag.active) return
  const { x, y } = drag
  let top = 0
  document.querySelectorAll<HTMLElement>('[data-top-overlay]').forEach((el) => {
    const pos = getComputedStyle(el).position
    if (pos === 'sticky' || pos === 'fixed') top = Math.max(top, el.getBoundingClientRect().bottom)
  })
  const tray = document.querySelector<HTMLElement>('[data-bottom-overlay]')
  const bottom = tray && getComputedStyle(tray).position === 'fixed' ? tray.getBoundingClientRect().top : innerHeight

  if (y > top + EDGE) armed.top = true
  if (y < bottom - EDGE) armed.bottom = true

  let dy = 0
  if (drag.over?.kind !== 'remove') {
    if (armed.top && y < top + EDGE) dy = -Math.ceil((Math.min(EDGE, top + EDGE - y) / EDGE) * 16)
    else if (armed.bottom && y > bottom - EDGE && y < bottom) dy = Math.ceil(((y - (bottom - EDGE)) / EDGE) * 16)
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
  armed.top = false
  armed.bottom = false
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
          // Tray: pulling a name upward picks it up straight away.
          if (inTray && dy < 0 && Math.abs(dy) > Math.abs(dx)) {
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
