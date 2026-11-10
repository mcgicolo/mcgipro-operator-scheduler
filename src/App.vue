<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { addAssignment, assignmentsBySchedule, groups, moveAssignment, requestRemove, state } from './store/board'
import { drag, setDropHandler } from './composables/useDrag'
import TopBar from './components/TopBar.vue'
import GroupHeader from './components/GroupHeader.vue'
import DutyColumn from './components/DutyColumn.vue'
import OperatorsPalette from './components/OperatorsPalette.vue'
import TrashZone from './components/TrashZone.vue'
import NameGate from './components/NameGate.vue'
import AssignSheet, { type SheetTarget } from './components/AssignSheet.vue'
import ConfirmRemove from './components/ConfirmRemove.vue'
import HistorySheet from './components/HistorySheet.vue'
import InstallGuide from './components/InstallGuide.vue'
import { installGuide } from './composables/useInstallGuide'

const editingName = ref(false)
const sheet = ref<SheetTarget | null>(null)
const copyOpen = ref(false)
/** History sheet: null = closed, else the search it opens with ('' = everything). */
const historyQuery = ref<string | null>(null)
const needsName = computed(() => state.phase === 'ready' && !state.nickname)
/** Any modal open: everything outside it (bars, board, tray) is made inert. */
const modalOpen = computed(
  () =>
    needsName.value ||
    editingName.value ||
    !!sheet.value ||
    !!state.confirmRemoveId ||
    copyOpen.value ||
    historyQuery.value !== null ||
    installGuide.isOpen,
)

// Offer the Home Screen guide once per visit, 1.5s after the board is usable (name set,
// nothing else open, not mid-drag). useInstallGuide decides whether it should auto-open
// at all (already installed, snoozed, in-app browser, automation).
let guideTimer = 0
let guideOffered = false
watch(
  () => state.phase === 'ready' && !modalOpen.value && !drag.active && installGuide.shouldAutoOpen,
  (idle) => {
    clearTimeout(guideTimer)
    if (!idle || guideOffered) return
    guideTimer = window.setTimeout(() => {
      guideOffered = true
      installGuide.open()
    }, 1500)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(guideTimer))
// While the remove zone is up, toasts move clear of it (desktop pill / phone tray cover).
const trashUp = computed(() => drag.active && !!drag.payload?.assignmentId)

// Focus return for the dialogs App opens with v-if (sheet, name edit). Capture the
// opener synchronously, before the board turns inert; on close, hand focus back if
// nothing else took it (the name edit falls back to the TopBar name button).
function restoreTo(fallbackSel: string | null) {
  let opener: HTMLElement | null = null
  return (open: boolean) => {
    if (open) {
      const a = document.activeElement
      opener = a instanceof HTMLElement && a !== document.body ? a : null
      return
    }
    const target = opener
    opener = null
    nextTick(() => {
      const a = document.activeElement
      if (a && a !== document.body) return
      const el = target?.isConnected ? target : fallbackSel ? document.querySelector<HTMLElement>(fallbackSel) : null
      el?.focus({ preventScroll: true })
    })
  }
}
watch(() => !!sheet.value, restoreTo(null), { flush: 'sync' })
watch(editingName, restoreTo('.navbar .nav-btn.me'), { flush: 'sync' })

function openHistory(query = '') {
  sheet.value = null
  historyQuery.value = query
}

/** From a History entry: close the sheet, bring the sticky into view and make it pulse. */
async function showOnBoard(assignmentId: string) {
  historyQuery.value = null
  await nextTick()
  const el = document.querySelector<HTMLElement>(`.sticky[data-assignment="${CSS.escape(assignmentId)}"]`)
  if (!el) return
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center', inline: 'center' })
  el.querySelector<HTMLElement>('.face')?.focus({ preventScroll: true })
  el.classList.remove('flash')
  void el.offsetWidth // restart the animation
  el.classList.add('flash')
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true })
}

setDropHandler((p, t) => {
  if (!t) return 'none'
  if (t.kind === 'remove') {
    if (!p.assignmentId) return 'none' // palette → palette: nothing to do
    requestRemove(p.assignmentId)
    return 'ok'
  }
  const res = p.assignmentId ? moveAssignment(p.assignmentId, t.id) : addAssignment(p.operatorId, t.id)
  return res === 'duplicate' ? 'reject' : res === 'ok' ? 'ok' : 'none'
})

const installIcon = `${import.meta.env.BASE_URL}icons/icon-192.png`

const covered = (ids: string[]) => ids.filter((id) => (assignmentsBySchedule.value[id] ?? []).length > 0).length
</script>

<template>
  <div v-if="state.phase === 'loading'" class="center">
    <div class="spinner" role="status" aria-label="Loading" />
  </div>

  <div v-else-if="state.phase === 'error'" class="center">
    <div class="banner" role="alert">
      <h1>The board can't be shown</h1>
      <template v-if="state.configErrors.length">
        <p>The board configuration has problems. Fix <code>public/schedule.json</code> / <code>public/operators.json</code> and redeploy:</p>
        <ul>
          <li v-for="e in state.configErrors" :key="e">{{ e }}</li>
        </ul>
      </template>
      <p v-else>{{ state.loadError }}</p>
      <button type="button" class="btn" onclick="location.reload()">Reload</button>
    </div>
  </div>

  <template v-else>
    <TopBar
      :blocked="modalOpen"
      @edit-name="editingName = true"
      @copy-dialog="(open) => (copyOpen = open)"
      @history="openHistory()"
    />

    <main class="board" :class="{ 'has-install': installGuide.isAvailable }" :inert="modalOpen || undefined">
      <OperatorsPalette @operator-tap="(id) => (sheet = { kind: 'operator', operatorId: id })" />

      <p v-if="state.instructions" class="intro">{{ state.instructions }}</p>
      <div class="groups">
        <section
          v-for="g in groups"
          :id="`group-${g.id}`"
          :key="g.id"
          class="group"
          :style="{ '--n': g.schedules.length }"
          :aria-label="g.name"
        >
          <GroupHeader
            :name="g.name"
            :short="g.short"
            :color="g.color"
            :filled="covered(g.schedules.map((s) => s.id))"
            :total="g.schedules.length"
          />
          <div class="cols">
            <DutyColumn
              v-for="s in g.schedules"
              :key="s.id"
              :schedule="s"
              @chip-tap="(id) => (sheet = { kind: 'assignment', assignmentId: id })"
            />
          </div>
        </section>
      </div>

      <!-- Phone layout only: on the desktop layout the guide opens on its own (iPad) and
           Chrome shows its own install button. -->
      <div v-if="installGuide.isAvailable" class="install-row">
        <button type="button" class="install-cell" @click="installGuide.open()">
          <img :src="installIcon" alt="" />
          <span class="install-text">
            <span>Add to Home Screen</span>
            <small>Open the board in one tap next time</small>
          </span>
          <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5l6.5 6.5L9 18.5" /></svg>
        </button>
      </div>
    </main>

    <TrashZone />

    <AssignSheet
      v-if="sheet"
      :target="sheet"
      :inert="state.confirmRemoveId ? true : undefined"
      @close="sheet = null"
      @history="openHistory"
    />
    <HistorySheet
      v-if="historyQuery !== null"
      :initial-query="historyQuery"
      @close="historyQuery = null"
      @show-on-board="showOnBoard"
    />
    <ConfirmRemove />
    <InstallGuide v-if="installGuide.isOpen" />
    <NameGate v-if="needsName" />
    <NameGate v-else-if="editingName" editing @close="editingName = false" />
  </template>

  <div class="toasts" :class="{ lifted: trashUp, behind: state.confirmRemoveId }" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in state.toasts" :key="t.id" class="toast" :class="t.kind">
        <svg v-if="t.kind === 'error'" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path d="M12 7v6M12 16.5v.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.center {
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 16px;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--fill-2);
  border-top-color: var(--label-2);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.banner {
  max-width: 640px;
  padding: 20px;
  border-radius: 14px;
  background: var(--bg-cell);
}
.banner h1 {
  margin: 0 0 8px;
  color: var(--danger);
  font-size: 20px;
}
.banner p {
  color: var(--label-2);
  font-size: 15px;
}
.banner li {
  margin: 4px 0;
  font: 13px/1.4 ui-monospace, Menlo, monospace;
}

/* ---------- mobile (base): iOS inset-grouped list ---------- */
.board {
  /* Side insets clear a landscape notch / Dynamic Island (0 in portrait). On a wide but
     short window (phone layout at >= 768px wide) the list is capped at --phone-max and
     centred, like an iPad readable-width table; the bars stay edge to edge. */
  --phone-max: 760px;
  padding: 8px max(16px, var(--safe-r), calc((100% - var(--phone-max)) / 2)) calc(var(--tray-h) + var(--safe-b) + 28px)
    max(16px, var(--safe-l), calc((100% - var(--phone-max)) / 2));
}
.intro {
  margin: 0 16px 22px;
  color: var(--label-2);
  font-size: 15px;
  line-height: 1.35;
}
.groups {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.group {
  scroll-margin-top: calc(var(--nav-h) + var(--seg-h) + var(--safe-t) + 12px);
}
.cols {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-cell);
}

/* Phone layout: give the last section enough room below it that the segmented control's
   jump (scrollIntoView, scroll-margin-top above) can bring it right under the bars.
   min-height = viewport − sticky bars (scroll margin) − the board's bottom padding. */
@media (max-width: 767.98px), (max-height: 539.98px) {
  .group:last-child {
    min-height: calc(100vh - var(--nav-h) - var(--seg-h) - var(--safe-t) - 12px - var(--tray-h) - var(--safe-b) - 28px);
  }
  /* The Add to Home Screen row below (32px gap + 60px cell) already provides part of that room. */
  .has-install .group:last-child {
    min-height: calc(100vh - var(--nav-h) - var(--seg-h) - var(--safe-t) - 12px - var(--tray-h) - var(--safe-b) - 28px - 92px);
  }
}

/* Compact height (phone held sideways; desktop needs min-height 540px): TopBar drops the
   large title and shortens its bars (38px nav + 36px segmented bar), so match the
   scroll offset and tighten the intro so the first duty row clears the tray. */
@media (max-height: 539.98px) {
  .board {
    /* --jump: gap left above a section's header after a segmented-control jump */
    --jump: 10px;
    padding-top: 6px;
  }
  .intro {
    margin-bottom: 12px;
    font-size: 13px;
  }
  .group {
    scroll-margin-top: calc(38px + 36px + var(--safe-t) + var(--jump));
  }
  .group:last-child {
    min-height: calc(100vh - 38px - 36px - var(--safe-t) - var(--jump) - var(--tray-h) - var(--safe-b) - 28px);
  }
  .has-install .group:last-child {
    min-height: calc(100vh - 38px - 36px - var(--safe-t) - var(--jump) - var(--tray-h) - var(--safe-b) - 28px - 92px);
  }
}

/* Short landscape (< 380px: most phones sideways once Safari's bars and a 21px
   home-indicator inset come off): the intro line would push the first duty under the
   tray, so it is kept for screen readers only (the tray hint says the same thing).
   First duty bottom = 74px bars + 6 + 34 header + 82 row = 196px; tray top at 350px
   with a 21px inset = 211px. */
@media (max-height: 379.98px) {
  .board {
    --jump: 6px;
  }
  .intro {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

/* Very short (< 340px: e.g. iPhone SE / mini sideways in Safari, ~320px): also drop the
   section monogram, tighten the header, the duty rows and the section gaps so a whole
   duty row (with its notes' remove badges) clears the tray: 74px bars + 2 + 23 header
   + 78 row = 177px, tray top at 320px with a 21px inset = 181px (202px without). */
@media (max-height: 339.98px) {
  .board {
    --jump: 2px;
    padding-top: 2px;
  }
  .groups {
    gap: 22px;
  }
  .group .group-header {
    padding-bottom: 5px;
  }
  .group .group-header :deep(.icon) {
    display: none;
  }
  .cols > :deep(.duty) {
    padding-top: 8px; /* the notes' remove badge pokes 7px above them */
    padding-bottom: 6px;
  }
}

.install-row {
  margin-top: 32px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-cell);
}
.install-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
  padding: 8px 12px 8px 16px;
  border: 0;
  background: none;
  text-align: left;
}
.install-cell:active {
  background: var(--fill-2);
}
.install-cell img {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 7px;
}
.install-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 17px;
}
.install-text small {
  color: var(--label-2);
  font-size: 13px;
}
.chev {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--label-3);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* iOS-style HUD pill, above the tray */
.toasts {
  position: fixed;
  /* Spans the safe area (clear of a landscape notch); pills center inside it. */
  right: max(16px, var(--safe-r));
  left: max(16px, var(--safe-l));
  bottom: calc(var(--tray-h) + var(--safe-b) + 14px);
  z-index: 150;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  transition: bottom 0.25s var(--ease-ios);
}
/* The remove confirmation sheet sits where the toasts do: let it cover them. */
.toasts.behind {
  z-index: 110;
}
/* Remove zone up: sit above its "Release to remove" chip (straddles the tray's top edge). */
.toasts.lifted {
  bottom: calc(var(--tray-h) + var(--safe-b) + 30px);
}
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px 12px 14px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--label);
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 0 0 0.5px var(--separator), 0 10px 30px rgba(0, 0, 0, 0.16);
}
.toast svg {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  color: var(--ios-green);
}
.toast.error svg {
  color: var(--danger);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s, transform 0.35s var(--ease-ios);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

/* Scroll hint for the desktop .groups scroller (animatable so a scroll timeline can drive it). */
@property --groups-fade {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}
@keyframes groups-fade {
  0%,
  85% {
    --groups-fade: 48px;
  }
  100% {
    --groups-fade: 0px;
  }
}

/* ---------- desktop: Miro layout (palette left, 9-column grid) ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .board {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    padding: 8px 20px 40px;
  }
  .intro,
  .install-row {
    display: none;
  }
  .groups {
    flex: 1;
    min-width: 0;
    flex-direction: row;
    gap: 14px;
    overflow-x: auto;
    padding-bottom: 12px;
    /* Right-edge fade while more columns are hidden off to the right (see @supports below). */
    -webkit-mask-image: linear-gradient(to left, transparent, #000 var(--groups-fade));
    mask-image: linear-gradient(to left, transparent, #000 var(--groups-fade));
  }
  @supports (animation-timeline: scroll()) {
    .groups {
      /* Only active when .groups actually overflows; fades out as you reach the end. */
      animation: groups-fade linear both;
      animation-timeline: scroll(self inline);
    }
  }
  /* Groups share the row by column count, but never grow wider than their columns can
     (--n columns at most --col-max each + the 8px .cols gaps), so a bar always ends with
     its last column. Spare width on very wide screens centres the row (auto margins only
     take positive free space, so an overflowing row still scrolls from its start). */
  .groups {
    --col-max: 170px;
  }
  .group {
    flex: var(--n, 1) 1 0;
    min-width: min-content;
    max-width: calc(var(--n, 1) * var(--col-max) + (var(--n, 1) - 1) * 8px);
  }
  .group:first-child {
    margin-left: auto;
  }
  .group:last-child {
    margin-right: auto;
  }
  .cols > :deep(.duty) {
    max-width: var(--col-max);
  }
  .cols {
    flex-direction: row;
    gap: 8px;
    overflow: visible;
    border-radius: 0;
    background: none;
  }
  .toasts {
    bottom: 24px;
  }
  /* above the 64px remove pill and its label chip */
  .toasts.lifted {
    bottom: calc(24px + 64px + 28px);
  }
}
</style>
