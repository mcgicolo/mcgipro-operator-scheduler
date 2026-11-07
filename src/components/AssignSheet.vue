<script setup lang="ts">
// Tap fallback for drag & drop (iOS page sheet):
//  - tap an operator in the tray  → checklist of duties (tap to add, tap again to remove)
//  - tap a placed chip            → "Move to…" list + "Remove from This Duty"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  addAssignment,
  findAssignment,
  groups,
  moveAssignment,
  operatorsById,
  requestRemove,
  schedulesById,
  state,
} from '../store/board'
import { formatTime, relativeTime, scheduleLabel } from '../utils/format'
import GatheringIcon from './GatheringIcon.vue'

export type SheetTarget = { kind: 'operator'; operatorId: string } | { kind: 'assignment'; assignmentId: string }

const props = defineProps<{ target: SheetTarget }>()
const emit = defineEmits<{ close: []; history: [operatorName: string] }>()
const panel = ref<HTMLElement>()

// Focus return: remember what opened the sheet (captured during setup, before the board
// behind turns inert) and hand focus back to it when the sheet closes (Done / Esc / scrim).
const opened = document.activeElement
const opener = opened instanceof HTMLElement && opened !== document.body ? opened : null
let operatorName = ''
onMounted(() => panel.value?.focus())
onUnmounted(() => {
  const name = operatorName
  nextTick(() => {
    const a = document.activeElement
    if (a && a !== document.body && a.isConnected) return // something else already took focus
    restoreTarget(name)?.focus({ preventScroll: true })
  })
})
/** The opener if it is still on the page; otherwise (chip moved / removed) one of this
 *  operator's notes: a placed chip, then the tray note; finally the first tray note. */
function restoreTarget(name: string): HTMLElement | null {
  if (opener?.isConnected && !opener.closest('[inert]')) return opener
  const faces = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]
  const label = (el: HTMLElement) => el.getAttribute('aria-label') ?? ''
  if (name) {
    const chip = faces('.sticky.v-chip .face').find((el) => label(el).startsWith(`${name}, `))
    if (chip) return chip
    const note = faces('.sticky.v-palette .face').find((el) => label(el).startsWith(`${name}.`))
    if (note) return note
  }
  return document.querySelector<HTMLElement>('.sticky.v-palette .face')
}

const assignment = computed(() =>
  props.target.kind === 'assignment' ? state.assignments[props.target.assignmentId] : undefined,
)
const operator = computed(() => {
  const id = props.target.kind === 'operator' ? props.target.operatorId : assignment.value?.operator_id
  return id ? operatorsById.value.get(id) : undefined
})
watch(operator, (op) => op && (operatorName = op.name), { immediate: true })
const currentSchedule = computed(() => (assignment.value ? schedulesById.value.get(assignment.value.schedule_id) : undefined))
const assignedCount = computed(() =>
  operator.value ? Object.values(state.assignments).filter((a) => a.operator_id === operator.value!.id).length : 0,
)

// The chip was removed (by us after confirming, or by someone else) → close.
watch(
  () => props.target.kind === 'assignment' && !assignment.value,
  (gone) => gone && emit('close'),
)

function toggle(scheduleId: string) {
  const op = operator.value
  if (!op) return
  const existing = findAssignment(op.id, scheduleId)
  if (existing) requestRemove(existing.id)
  else addAssignment(op.id, scheduleId)
}

function moveTo(scheduleId: string) {
  if (!assignment.value) return
  if (moveAssignment(assignment.value.id, scheduleId) === 'ok') emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      ref="panel"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="operator?.name ?? 'Sticky'"
      tabindex="-1"
      @keydown.esc="state.confirmRemoveId || emit('close')"
    >
      <div class="grabber" aria-hidden="true" />
      <nav class="nav">
        <span />
        <h2>{{ target.kind === 'operator' ? 'Assign Duties' : 'Sticky' }}</h2>
        <button type="button" class="done" @click="emit('close')">Done</button>
      </nav>

      <div v-if="operator" class="scroll">
        <div class="hero">
          <span class="note" :style="{ background: operator.color }">{{ operator.name }}</span>
          <div class="hero-text">
            <p class="hero-name">{{ operator.name }}</p>
            <p v-if="target.kind === 'operator'" class="hero-sub">
              {{ assignedCount ? `${assignedCount} dut${assignedCount === 1 ? 'y' : 'ies'} this month` : 'Tap duties to take them' }}
            </p>
            <p v-else-if="assignment && currentSchedule" class="hero-sub">
              {{ scheduleLabel(currentSchedule) }}<br />
              Moved by {{ assignment.moved_by }} · {{ relativeTime(assignment.moved_at, state.now) }}
            </p>
          </div>
        </div>

        <!-- Operator: checklist -->
        <template v-if="target.kind === 'operator'">
          <section v-for="g in groups" :key="g.id">
            <h3><GatheringIcon :short="g.short" :color="g.color" :size="22" /><span>{{ g.name }}</span></h3>
            <div class="list" role="group" :aria-label="g.name">
              <button
                v-for="s in g.schedules"
                :key="s.id"
                type="button"
                class="cell"
                role="checkbox"
                :aria-checked="!!findAssignment(operator.id, s.id)"
                @click="toggle(s.id)"
              >
                <span class="ico" :class="s.mode === 'LIVE' ? 'live' : 'pb'" aria-hidden="true" />
                <span class="cell-text">
                  <span><b>{{ s.day }}</b> {{ formatTime(s.time) }}</span>
                  <small>{{ s.mode === 'LIVE' ? 'Live' : 'Playback' }}</small>
                </span>
                <svg v-if="findAssignment(operator.id, s.id)" class="check" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          </section>
        </template>

        <!-- Placed chip: move / remove -->
        <template v-else-if="assignment">
          <section v-for="g in groups" :key="g.id">
            <h3><GatheringIcon :short="g.short" :color="g.color" :size="22" /><span>Move to · {{ g.name }}</span></h3>
            <div class="list">
              <button
                v-for="s in g.schedules"
                :key="s.id"
                type="button"
                class="cell"
                :disabled="s.id === assignment.schedule_id || !!findAssignment(operator.id, s.id)"
                @click="moveTo(s.id)"
              >
                <span class="ico" :class="s.mode === 'LIVE' ? 'live' : 'pb'" aria-hidden="true" />
                <span class="cell-text">
                  <span><b>{{ s.day }}</b> {{ formatTime(s.time) }}</span>
                  <small>{{ s.mode === 'LIVE' ? 'Live' : 'Playback' }}</small>
                </span>
                <svg v-if="s.id === assignment.schedule_id" class="check" viewBox="0 0 24 24" aria-label="Current">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span v-else-if="findAssignment(operator.id, s.id)" class="trail">Assigned</span>
              </button>
            </div>
          </section>
          <section>
            <div class="list">
              <button type="button" class="cell destructive" @click="requestRemove(assignment.id)">Remove from This Duty</button>
            </div>
          </section>
        </template>

        <section>
          <div class="list">
            <button type="button" class="cell link" @click="emit('history', operator.name)">
              <span class="ico hist" aria-hidden="true" />
              <span class="cell-text">
                <span>View History</span>
                <small>Who added, moved or removed {{ operator.name.split(' ')[0] }}</small>
              </span>
              <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5l6.5 6.5L9 18.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- mobile (base): iOS page sheet ---------- */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-top: calc(var(--safe-t) + 10px);
  background: rgba(0, 0, 0, 0.35);
  animation: fade 0.25s;
}
.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 100%;
  border-radius: 12px 12px 0 0;
  background: var(--bg-grouped);
  outline: none;
  animation: up 0.42s var(--ease-ios);
}
.grabber {
  position: absolute;
  top: 5px;
  left: 50%;
  width: 36px;
  height: 5px;
  margin-left: -18px;
  border-radius: 3px;
  background: var(--label-3);
}
.nav {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 56px;
  padding: 6px 8px 0 16px;
}
.nav h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.done {
  justify-self: end;
  min-width: 44px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 17px;
  font-weight: 600;
}
.scroll {
  overflow-y: auto;
  padding: 4px 16px calc(24px + var(--safe-b));
  overscroll-behavior: contain;
}
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 4px 0 22px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-cell);
}
.note {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 4px;
  border-radius: 12px;
  color: var(--sticky-ink);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.1);
}
.hero-text {
  min-width: 0;
}
.hero-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.hero-sub {
  margin: 2px 0 0;
  color: var(--label-2);
  font-size: 15px;
}
h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0 16px 7px;
  color: var(--label-2);
  font-size: 13px;
  font-weight: 400;
  text-transform: uppercase;
}
section {
  margin-bottom: 26px;
}
.list {
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-cell);
}
.cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 8px 16px;
  border: 0;
  background: none;
  color: var(--label);
  text-align: left;
}
.cell + .cell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 58px;
  right: 0;
  height: 0.5px;
  background: var(--separator);
}
.cell:active:not(:disabled) {
  background: var(--fill-2);
}
.cell:disabled {
  cursor: default;
}
.cell:disabled .cell-text {
  opacity: 0.45;
}
.ico {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--ios-blue)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M8 5.5v13l11-6.5z' fill='white'/%3E%3C/svg%3E")
    center / 18px no-repeat;
}
.ico.live {
  background: var(--ios-red)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='3' fill='white'/%3E%3Cpath d='M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")
    center / 18px no-repeat;
}
.ico.hist {
  background: #636366
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.2 3.8v4.6h4.6M12 7.5V12l3 2' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center / 18px no-repeat;
}
.chev {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--label-3);
}
.cell-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 17px;
}
.cell-text b {
  font-weight: 600;
}
.cell-text small {
  color: var(--label-2);
  font-size: 13px;
}
.check {
  width: 22px;
  height: 22px;
  color: var(--tint);
}
.trail {
  color: var(--label-2);
  font-size: 15px;
}
.destructive {
  justify-content: center;
  min-height: 50px;
  color: var(--danger);
  font-size: 17px;
}

@keyframes fade {
  from { background: transparent; }
}
@keyframes up {
  from { transform: translateY(100%); }
}

/* ---------- compact height (phone held sideways) ----------
   iOS keeps a page sheet at a readable width, centred, rather than stretching it
   across the whole landscape screen. Symmetric side padding keeps it centred on the
   screen and clear of the notch / Dynamic Island on whichever side it is. */
@media (max-height: 539.98px) {
  .overlay {
    padding: calc(var(--safe-t) + 8px) max(var(--safe-l), var(--safe-r)) 0;
  }
  .sheet {
    width: min(600px, 100%);
  }
  .nav {
    height: 48px;
    padding-top: 4px;
  }
  .scroll {
    padding-bottom: calc(16px + var(--safe-b));
  }
  .hero {
    margin-bottom: 18px;
    padding: 10px 14px;
  }
  .note {
    width: 48px;
    height: 48px;
  }
  section {
    margin-bottom: 22px;
  }
}

/* ---------- desktop: centered form sheet ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .overlay {
    align-items: center;
    padding: 24px;
  }
  .sheet {
    width: min(480px, 100%);
    max-height: min(720px, 90vh);
    border-radius: 14px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
    animation: pop 0.3s var(--ease-ios);
  }
  .grabber {
    display: none;
  }
  .cell:hover:not(:disabled) {
    background: var(--fill);
  }
  @keyframes pop {
    from { transform: scale(0.94); opacity: 0; }
  }
}
</style>
