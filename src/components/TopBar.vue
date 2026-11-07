<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildScheduleText, groups, state, toast } from '../store/board'
import { unreadCount } from '../store/history'
import ThemeSwitch from './ThemeSwitch.vue'

/** `blocked`: a modal is open somewhere — the bars go inert (the copy dialog is ours). */
const props = defineProps<{ blocked?: boolean }>()
const emit = defineEmits<{ editName: []; copyDialog: [open: boolean]; history: [] }>()
const historyLabel = computed(() =>
  unreadCount.value ? `History, ${unreadCount.value} new change${unreadCount.value === 1 ? '' : 's'}` : 'History',
)

const fallbackText = ref<string | null>(null)
const fallbackOpen = computed(() => fallbackText.value !== null)
const barsInert = computed(() => props.blocked || fallbackOpen.value || undefined)
const textarea = ref<HTMLTextAreaElement>()
const copyBtn = ref<HTMLButtonElement>()
watch(fallbackOpen, (open) => emit('copyDialog', open))
const largeTitle = ref<HTMLElement>()
const navbar = ref<HTMLElement>()
const titleText = ref<HTMLElement>()
const titleFits = ref(true)
const collapsed = ref(false)
const activeGroup = ref<string | null>(null)

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
const title = computed(() => titleCase(state.title))

const status = computed(() => {
  if (state.backendKind === 'local') return { cls: 'demo', label: 'Demo mode' }
  if (state.connection === 'live') return { cls: 'live', label: state.backendKind === 'postgres' ? 'Live · local DB' : 'Live' }
  if (state.connection === 'offline') return { cls: 'off', label: 'Reconnecting…' }
  return { cls: 'off', label: 'Connecting…' }
})

// Compact height (phone held sideways): like iOS, no large title. The nav bar shows the
// inline title (plus a month/status subtitle) from the start. Desktop needs
// min-height 540px, so compact height always means the phone layout.
const compactMq = typeof matchMedia === 'function' ? matchMedia('(max-height: 539.98px)') : null

// ---------- Keep the reading position across rotation / window resize ----------
// Every scroll frame remembers the first duty (or group header) that shows below the
// bars and where it sits. When the layout changes (width, or the compact-height switch),
// that element is put back in the same spot, re-applied each frame until the layout has
// settled (bar heights, --nav-w and the tray follow a frame or two later). The restore
// is always instant (no animation, so reduced motion is respected too), stops as soon as
// the user touches, wheels or presses a key, and the scroll spy keeps the group it had
// until the user scrolls again. Height-only resizes (mobile URL bar) are left alone.
type Anchor = { el: Element | null; off: number; frac: number | null }
let anchor: Anchor | null = null
let restoring = false
let restoreRaf = 0
let restoreDeadline = 0
let stableFrames = 0
let spyHeld = false
let settledY = 0
let lastW = typeof innerWidth === 'number' ? innerWidth : 0
let lastCompact = !!compactMq?.matches
/** Group being scrolled to by the jump bar (smooth scroll in flight), else null. */
let jumping: string | null = null
let jumpTimer = 0
const userInputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/** Where the bars end once stuck (independent of scroll, unlike the segbar's live rect). */
function barsLine() {
  const seg = document.querySelector<HTMLElement>('.segbar')
  if (!seg || !seg.getClientRects().length) return 0 // desktop: no sticky bars
  return (parseFloat(getComputedStyle(seg).top) || 0) + seg.offsetHeight
}

function anchorCandidates(): Element[] {
  const out: Element[] = []
  for (const g of groups.value) {
    const sec = document.getElementById(`group-${g.id}`)
    if (!sec) continue
    if (sec.firstElementChild) out.push(sec.firstElementChild) // group header
    out.push(...sec.querySelectorAll('.duty'))
  }
  return out
}

function captureAnchor() {
  if (scrollY <= 0) {
    anchor = { el: null, off: 0, frac: null } // at the very top: stay at the top
    return
  }
  const line = barsLine()
  for (const el of anchorCandidates()) {
    const r = el.getBoundingClientRect()
    if (r.bottom <= line + 1) continue
    const off = r.top - line
    // Partly under the bars: keep the same fraction of it hidden (its height can change).
    anchor = { el, off, frac: off < 0 && r.height > 0 ? -off / r.height : null }
    return
  }
}

/** Scrolls the anchor back into place; returns how far the page actually moved. */
function applyAnchor(): number {
  const before = scrollY
  if (jumping) {
    // A jump-bar scroll was in flight: land on its target instead.
    document.getElementById(`group-${jumping}`)?.scrollIntoView({ behavior: 'instant', block: 'start' })
    return scrollY - before
  }
  if (!anchor) return 0
  let delta: number
  if (!anchor.el) delta = -scrollY
  else if (!anchor.el.isConnected) return 0
  else {
    const r = anchor.el.getBoundingClientRect()
    delta = r.top - (barsLine() + (anchor.frac !== null ? -anchor.frac * r.height : anchor.off))
  }
  if (Math.abs(delta) < 1) return 0
  scrollTo({ top: scrollY + delta, behavior: 'instant' })
  return scrollY - before
}

function startRestore() {
  if (!anchor && !jumping) return
  if (jumping) activeGroup.value = jumping
  restoring = true
  stableFrames = 0
  restoreDeadline = performance.now() + 1000
  cancelAnimationFrame(restoreRaf)
  applyAnchor()
  const tick = () => {
    stableFrames = Math.abs(applyAnchor()) >= 1 ? 0 : stableFrames + 1
    if (stableFrames >= 3 || performance.now() > restoreDeadline) {
      restoreRaf = 0
      restoring = false
      settledY = scrollY
      spyHeld = true
      if (jumping) endJump()
      return
    }
    restoreRaf = requestAnimationFrame(tick)
  }
  restoreRaf = requestAnimationFrame(tick)
}

/** The user took over (touch, wheel, key): stop restoring and let the spy follow again. */
function onUserInput() {
  if (restoring) {
    cancelAnimationFrame(restoreRaf)
    restoreRaf = 0
    restoring = false
  }
  spyHeld = false
  if (jumping) endJump()
}

function endJump() {
  clearTimeout(jumpTimer)
  jumping = null
  if (!restoring) captureAnchor()
}

/** True (and remembered) when the viewport change can reflow the board. */
function layoutChanged() {
  const compact = !!compactMq?.matches
  if (innerWidth === lastW && compact === lastCompact) return false
  lastW = innerWidth
  lastCompact = compact
  return true
}

function onResize() {
  if (layoutChanged()) startRestore()
  onScroll()
}

// Large title → inline title, and segmented-control scroll spy (iOS behaviour).
let raf = 0
function onScroll() {
  if (jumping) {
    // Smooth jump still moving: it is over once scroll events stop for a moment.
    clearTimeout(jumpTimer)
    jumpTimer = window.setTimeout(endJump, 150)
  }
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    // A reflow that reached us before the resize event: restore, don't re-anchor on it.
    if (layoutChanged()) startRestore()
    else if (!restoring && !jumping) captureAnchor()
    if (spyHeld && !restoring && Math.abs(scrollY - settledY) > 1) spyHeld = false
    const h1 = largeTitle.value?.querySelector('h1')
    const navBottom = document.querySelector('.navbar')?.getBoundingClientRect().bottom ?? 0
    // Compact height hides the large title, so the bars only take on their material
    // background once content scrolls under them.
    collapsed.value = compactMq?.matches ? scrollY > 0 : !!h1 && h1.getBoundingClientRect().bottom <= navBottom
    const seg = document.querySelector('.segbar')?.getBoundingClientRect().bottom ?? 0
    let current = groups.value[0]?.id ?? null
    for (const g of groups.value) {
      const el = document.getElementById(`group-${g.id}`)
      // A section becomes active once its header reaches the upper third of the visible list.
      if (el && el.getBoundingClientRect().top <= seg + (innerHeight - seg) * 0.33) current = g.id
    }
    // At the very bottom, the last section is the active one.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current = groups.value.at(-1)?.id ?? current
    // While the reading position is being restored (and until the user scrolls on), the
    // jump bar keeps the group it had: the reflow must not flip it.
    if (!restoring && !spyHeld) activeGroup.value = current
  })
}
// Desktop: the action cluster floats top-right over the title, so publish its real
// width as --nav-w and let the title reserve exactly that much room. On wide screens
// the title is centered (same reserve on both sides) only while it still fits on
// one line; otherwise it falls back to the left-aligned layout.
let navObserver: ResizeObserver | null = null
function layoutTitle() {
  const navW = Math.ceil(navbar.value?.getBoundingClientRect().width ?? 0)
  document.documentElement.style.setProperty('--nav-w', `${navW}px`)
  const large = largeTitle.value
  const span = titleText.value
  if (!large || !span) return
  span.style.whiteSpace = 'nowrap'
  const textW = span.getBoundingClientRect().width
  span.style.whiteSpace = ''
  const inner = large.clientWidth - 40 // .large has 20px side padding on desktop
  titleFits.value = inner - 2 * (navW + 40) >= textW
}
watch(title, () => nextTick(layoutTitle))
onMounted(() => {
  addEventListener('scroll', onScroll, { passive: true })
  // Rotating switches between the large-title and compact layouts without a scroll.
  addEventListener('resize', onResize)
  for (const t of userInputs) addEventListener(t, onUserInput, { passive: true, capture: true })
  onScroll()
  layoutTitle()
  if (typeof ResizeObserver === 'function') {
    navObserver = new ResizeObserver(layoutTitle)
    if (navbar.value) navObserver.observe(navbar.value)
    if (largeTitle.value) navObserver.observe(largeTitle.value)
  }
})
onBeforeUnmount(() => {
  removeEventListener('scroll', onScroll)
  removeEventListener('resize', onResize)
  for (const t of userInputs) removeEventListener(t, onUserInput, { capture: true })
  cancelAnimationFrame(restoreRaf)
  clearTimeout(jumpTimer)
  navObserver?.disconnect()
  document.documentElement.style.removeProperty('--nav-w')
})

function jump(id: string) {
  activeGroup.value = id
  spyHeld = false
  jumping = id
  clearTimeout(jumpTimer)
  jumpTimer = window.setTimeout(endJump, 150) // in case there is nothing to scroll
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(`group-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

async function closeFallback() {
  fallbackText.value = null
  await nextTick() // the bars stop being inert first
  copyBtn.value?.focus()
}

async function copy() {
  const text = buildScheduleText()
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard')
    await navigator.clipboard.writeText(text)
    toast('Schedule copied — paste it in Messenger')
  } catch {
    fallbackText.value = text
    await nextTick()
    textarea.value?.focus()
    textarea.value?.select()
    // select() scrolls the caret (end of text) into view; show the top instead.
    if (textarea.value) textarea.value.scrollTop = 0
  }
}
</script>

<template>
  <header ref="navbar" class="navbar" :class="{ collapsed }" :inert="barsInert" data-top-overlay>
    <button type="button" class="nav-btn me" :title="`You are ${state.nickname} — tap to change`" @click="emit('editName')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8" />
        <circle cx="12" cy="10" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M5.8 18.6c1.4-2.2 3.6-3.3 6.2-3.3s4.8 1.1 6.2 3.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span class="nick">{{ state.nickname || 'Set name' }}</span>
    </button>
    <span class="inline-title" aria-hidden="true">
      <span class="it-main">{{ title }}</span>
      <span class="it-sub" :class="status.cls">{{ state.month }}<span class="it-sep">·</span><i />{{ status.label }}</span>
    </span>
    <span class="status" :class="status.cls"><i aria-hidden="true" />{{ status.label }}</span>
    <span class="right">
    <ThemeSwitch />
    <button type="button" class="nav-btn history" :aria-label="historyLabel" title="History: who changed what" @click="emit('history')">
      <span class="h-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <path d="M3.2 3.8v4.6h4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-if="unreadCount" class="h-badge" aria-hidden="true">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
      </span>
      <span class="history-label">History</span>
    </button>
    <button ref="copyBtn" type="button" class="nav-btn copy" aria-label="Copy schedule as text" title="Copy schedule as text" @click="copy">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M15.5 5.5V5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span class="copy-label">Copy schedule</span>
    </button>
    </span>
  </header>

  <div ref="largeTitle" class="large" :class="{ centered: titleFits }" :inert="barsInert">
    <h1><span ref="titleText">{{ title }}</span></h1>
    <p class="sub">
      <span class="month">Month of: <strong>{{ state.month }}</strong></span>
      <span v-if="state.instructions" class="instr"> • {{ state.instructions }}</span>
      <span class="status-inline" :class="status.cls"><i aria-hidden="true" />{{ status.label }}</span>
    </p>
  </div>

  <div class="segbar" :class="{ collapsed }" :inert="barsInert" data-top-overlay>
    <!-- Jump links, not tabs: there are no tab panels, every section stays on the page. -->
    <nav class="segmented" aria-label="Jump to gathering">
      <button
        v-for="g in groups"
        :key="g.id"
        type="button"
        :aria-current="activeGroup === g.id ? 'true' : undefined"
        :class="{ on: activeGroup === g.id }"
        @click="jump(g.id)"
      >
        {{ titleCase(g.name) }}
      </button>
    </nav>
  </div>

  <div
    v-if="fallbackText !== null"
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Copy schedule"
    @click.self="closeFallback"
    @keydown.esc.prevent="closeFallback"
  >
    <div class="card">
      <h2>Copy Schedule</h2>
      <p>Select all and copy this text.</p>
      <textarea ref="textarea" readonly :value="fallbackText" rows="12" />
      <button type="button" class="btn primary" @click="closeFallback">Done</button>
    </div>
  </div>
</template>

<style scoped>
/* ---------- mobile (base): iOS navigation bar with large title ---------- */
.navbar {
  position: sticky;
  top: 0;
  z-index: 21;
  display: grid;
  /* Like UIKit: the title gets the room between the leading and trailing items (centred in
     it), so three trailing buttons don't squeeze it to a few letters; the name button can
     take at most 40% of the bar. */
  grid-template-columns: fit-content(40%) minmax(0, 1fr) auto;
  align-items: center;
  height: calc(var(--nav-h) + var(--safe-t));
  /* Material stays edge to edge; the buttons clear a landscape notch / Dynamic Island. */
  padding: var(--safe-t) max(8px, var(--safe-r)) 0 max(8px, var(--safe-l));
  background: var(--bg-grouped);
  transition: background 0.2s;
}
.navbar.collapsed {
  background: var(--material);
  backdrop-filter: saturate(1.8) blur(20px);
  -webkit-backdrop-filter: saturate(1.8) blur(20px);
}
.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 44px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 17px;
}
.nav-btn:active {
  opacity: 0.4;
}
.nav-btn svg {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
}
.me {
  justify-self: start;
  min-width: 0;
  max-width: 100%;
  padding: 0 6px;
}
.nick {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.right {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0;
}
.copy {
  justify-content: center;
}
.copy-label,
.history-label,
.status {
  display: none;
}
.history {
  justify-content: center;
}
.h-icon {
  position: relative;
  display: inline-flex;
}
/* iOS badge: red pill on the icon's top-right */
.h-badge {
  position: absolute;
  top: -6px;
  left: 13px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  border: 1.5px solid var(--bg-grouped);
  background: var(--danger-fill);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
}
.inline-title {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  margin-inline: 4px;
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  opacity: 0;
  transition: opacity 0.2s;
}
.it-main,
.it-sub {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.it-sub {
  display: none;
}
.collapsed .inline-title {
  opacity: 1;
}

.large {
  padding: 2px max(16px, var(--safe-r)) 8px max(16px, var(--safe-l));
}
h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 700;
  line-height: 41px;
  letter-spacing: 0.011em;
}
.sub {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0 0;
  color: var(--label-2);
  font-size: 15px;
}
.sub strong {
  color: var(--label);
  font-weight: 600;
}
.instr {
  display: none;
}
.status-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  background: var(--fill);
  font-size: 13px;
}
.status-inline i,
.status i,
.it-sub i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--label-3);
}
.live i {
  background: var(--ios-green) !important;
}
.demo i {
  background: var(--ios-orange) !important;
}

.segbar {
  position: sticky;
  top: calc(var(--nav-h) + var(--safe-t));
  z-index: 20;
  padding: 6px max(16px, var(--safe-r)) 10px max(16px, var(--safe-l));
  background: var(--bg-grouped);
  transition: background 0.2s, box-shadow 0.2s;
}
.segbar.collapsed {
  background: var(--material);
  backdrop-filter: saturate(1.8) blur(20px);
  -webkit-backdrop-filter: saturate(1.8) blur(20px);
  box-shadow: 0 0.5px 0 var(--separator);
}
.segmented {
  display: flex;
  padding: 2px;
  border-radius: 9px;
  background: var(--fill);
}
.segmented button {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  overflow: hidden;
  border: 0;
  border-radius: 7px;
  background: none;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 0.2s, box-shadow 0.2s;
}
.segmented button.on {
  background: var(--seg-on);
  font-weight: 600;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12), 0 3px 1px rgba(0, 0, 0, 0.04);
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: max(16px, var(--safe-t)) max(16px, var(--safe-r)) max(16px, var(--safe-b)) max(16px, var(--safe-l));
  background: rgba(0, 0, 0, 0.35);
}
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(520px, 100%);
  /* Fit short (landscape) viewports: the textarea gives up height first. */
  max-height: 100%;
  min-height: 0;
  padding: 20px;
  border-radius: 14px;
  background: var(--bg-elevated);
}
.card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.card p {
  margin: 0;
  color: var(--label-2);
  font-size: 15px;
}
textarea {
  flex: 1 1 auto;
  min-height: 64px;
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 10px;
  background: var(--fill);
  color: var(--label);
  font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  resize: vertical;
}

/* Phone portrait, large title showing: the inline title is invisible, so it gives up its
   middle column and the name button may use everything left of the action buttons.
   Once the bar collapses the symmetric three-column layout returns. */
@media (max-width: 767.98px) and (min-height: 540px) {
  .navbar:not(.collapsed) {
    grid-template-columns: minmax(0, 1fr) 0 auto;
  }
  .navbar:not(.collapsed) .inline-title {
    visibility: hidden;
    margin-inline: 0;
  }
}

/* ---------- compact height (phone held sideways) ----------
   iOS drops large titles in compact height: the bar shows the inline title from the
   start, with the month/status as a subtitle, and the bars get a little shorter so
   the first duty row clears the tray on a ~370px-tall viewport. Desktop needs
   min-height 540px, so this only ever applies to the phone layout. */
@media (max-height: 539.98px) {
  .navbar {
    height: calc(38px + var(--safe-t));
  }
  .nav-btn {
    height: 38px;
  }
  .inline-title {
    opacity: 1;
  }
  .it-main {
    font-size: 15px;
    line-height: 18px;
  }
  .it-sub {
    display: block;
    color: var(--label-2);
    font-size: 11px;
    font-weight: 400;
    line-height: 14px;
  }
  .it-sub i {
    display: inline-block;
    margin-right: 4px;
    vertical-align: 1px;
    width: 6px;
    height: 6px;
  }
  .it-sep {
    margin: 0 5px;
  }
  /* Still read by screen readers (the inline title is aria-hidden). */
  .large {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .segbar {
    top: calc(38px + var(--safe-t));
    padding-top: 2px;
    padding-bottom: 6px;
  }
  .segmented button {
    height: 24px;
  }
  /* Wide but short window (still the phone layout): bar backgrounds stay edge to edge,
     their content lines up with the board's centred 760px column (App.vue --phone-max). */
  .navbar {
    padding-right: max(8px, var(--safe-r), calc((100% - 760px) / 2 - 8px));
    padding-left: max(8px, var(--safe-l), calc((100% - 760px) / 2 - 8px));
  }
  .segbar {
    padding-right: max(16px, var(--safe-r), calc((100% - 760px) / 2));
    padding-left: max(16px, var(--safe-l), calc((100% - 760px) / 2));
  }
}

/* ---------- desktop: Miro-style centered title, actions top-right ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .navbar,
  .navbar.collapsed {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
    height: auto;
    padding: 0;
    background: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .inline-title,
  .segbar,
  .status-inline {
    display: none;
  }
  .status {
    order: -1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-size: 12px;
    white-space: nowrap;
  }
  .nav-btn {
    height: 40px;
    padding: 0 16px 0 10px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
  }
  .me {
    border: 1px solid var(--col-border);
    background: var(--surface);
    color: var(--ink);
  }
  .me {
    padding: 0 16px 0 10px;
  }
  .nick {
    max-width: 120px;
  }
  .right {
    gap: 10px;
  }
  .nav-btn svg {
    width: 20px;
    height: 20px;
  }
  .copy {
    background: var(--ink);
    color: var(--surface);
  }
  .history {
    border: 1px solid var(--col-border);
    background: var(--surface);
    color: var(--ink);
  }
  /* Badge on the pill's top-right corner, clear of the label. */
  .history {
    position: relative;
  }
  .h-icon {
    position: static;
  }
  .h-badge {
    top: -6px;
    right: -6px;
    left: auto;
    border-color: var(--canvas);
  }
  .copy-label,
  .history-label {
    display: inline;
  }
  .large {
    padding: 26px 20px 18px;
    text-align: left;
  }
  /* Reserve the floating action cluster's real width (--nav-w, kept current by a
     ResizeObserver). Only the h1 shares the navbar's row; the subtitle line sits
     below it and keeps the full width. */
  h1 {
    padding-right: calc(var(--nav-w, 420px) + 24px);
  }
  h1 {
    font-size: 30px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  .sub {
    justify-content: flex-start;
    gap: 0;
    margin-top: 6px;
    color: var(--ink-2);
    font-size: 13px;
  }
  .sub strong {
    color: var(--ink);
  }
  .instr {
    display: inline;
    white-space: pre;
  }
}
@media (min-width: 1200px) and (min-height: 540px) {
  /* Centered title with a symmetric reserve, while it fits on one line (titleFits). */
  .large.centered {
    text-align: center;
  }
  .large.centered h1 {
    padding-inline: calc(var(--nav-w, 420px) + 40px);
  }
  .large.centered .sub {
    justify-content: center;
  }
}
@media (min-width: 1440px) and (min-height: 540px) {
  /* Room to spare: show more of a long nickname (--nav-w keeps the title clear). */
  .nick {
    max-width: 200px;
  }
}
@media (min-width: 768px) and (min-height: 540px) and (max-width: 1199.98px) {
  .instr {
    display: none;
  }
}
@media (min-width: 768px) and (min-height: 540px) and (max-width: 899.98px) {
  /* Icon-only copy button (aria-label/title keep it named). */
  .copy,
  .history {
    width: 40px;
    padding: 0;
  }
  .copy-label,
  .history-label {
    display: none;
  }
}
</style>
