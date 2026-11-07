<script setup lang="ts">
// iOS action sheet (phone) / alert (desktop) confirming a sticky removal.
import { computed, nextTick, ref, watch } from 'vue'
import { operatorsById, removeAssignment, schedulesById, state } from '../store/board'
import { scheduleLabel } from '../utils/format'

const cancelBtn = ref<HTMLButtonElement>()

const row = computed(() => (state.confirmRemoveId ? state.assignments[state.confirmRemoveId] : undefined))
const name = computed(() => (row.value ? operatorsById.value.get(row.value.operator_id)?.name : undefined))
const duty = computed(() => {
  const s = row.value && schedulesById.value.get(row.value.schedule_id)
  return s ? scheduleLabel(s) : ''
})

// Someone else removed it meanwhile → close.
watch(row, (r) => {
  if (state.confirmRemoveId && !r) state.confirmRemoveId = null
})

// Focus management: move focus into the alert on open (Cancel = safe default for a
// destructive alert) and hand it back to whatever opened it on close.
let opener: HTMLElement | null = null
let openerScheduleId: string | null = null
let openerAssignmentId = ''
// The template ref is cleared as soon as v-if flips, while the leave transition keeps
// the (focused) alert in the DOM — so remember the element itself.
let dialogEl: HTMLElement | null = null

watch(
  () => state.confirmRemoveId,
  async (id, prev) => {
    if (id && !prev) {
      const active = document.activeElement
      opener = active instanceof HTMLElement && active !== document.body ? active : null
      openerAssignmentId = id
      openerScheduleId = state.assignments[id]?.schedule_id ?? null
      await nextTick()
      dialogEl = cancelBtn.value?.closest<HTMLElement>('[role="alertdialog"]') ?? null
      cancelBtn.value?.focus()
    } else if (!id && prev) {
      const target = opener
      const scheduleId = openerScheduleId
      const dialog = dialogEl
      const assignmentId = openerAssignmentId
      opener = openerScheduleId = dialogEl = null
      await nextTick()
      restoreFocus(target, assignmentId, scheduleId, dialog)
    }
  },
)

function restoreFocus(target: HTMLElement | null, assignmentId: string, scheduleId: string | null, dialog: HTMLElement | null) {
  // Something else (e.g. a sheet) already took focus deliberately — leave it.
  const active = document.activeElement
  if (active && active !== document.body && !dialog?.contains(active)) return
  // Cancelled: the opener is still there. (After a removal it may linger in the DOM
  // for its leave animation, so go by the data, not by isConnected alone.)
  if (state.assignments[assignmentId] && target?.isConnected) {
    target.focus({ preventScroll: true })
    if (document.activeElement === target) return
  }
  // Opener is gone (the sticky was removed): fall back to the next sticky in that duty.
  if (!scheduleId) return
  const duty = document.querySelector<HTMLElement>(`[data-drop="schedule:${CSS.escape(scheduleId)}"]`)
  const next = [...(duty?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? [])].find(
    (el) => !el.closest('[class*="-leave-"]') && !(target && (el.contains(target) || target.contains(el))),
  )
  next?.focus({ preventScroll: true })
}

function cancel() {
  state.confirmRemoveId = null
}
function confirm() {
  const id = state.confirmRemoveId
  state.confirmRemoveId = null
  if (id) removeAssignment(id)
}
</script>

<template>
  <Transition name="as">
    <div v-if="row" class="overlay" @click.self="cancel" @keydown.esc="cancel">
      <div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="cr-title" aria-describedby="cr-msg">
        <div class="group">
          <div class="msg">
            <p id="cr-title" class="title">Remove {{ name }}?</p>
            <p id="cr-msg" class="sub">They'll be taken off {{ duty }}.</p>
          </div>
          <button type="button" class="action destructive" @click="confirm">Remove</button>
        </div>
        <button ref="cancelBtn" type="button" class="action cancel" @click="cancel">Cancel</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ---------- mobile (base): iOS action sheet ---------- */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 8px calc(8px + var(--safe-b));
  background: rgba(0, 0, 0, 0.35);
}
.sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 420px;
}
.group,
.cancel {
  overflow: hidden;
  border-radius: 14px;
  background: var(--material-thick);
  backdrop-filter: blur(30px) saturate(1.8);
  -webkit-backdrop-filter: blur(30px) saturate(1.8);
}
.msg {
  padding: 14px 16px;
  text-align: center;
}
.title {
  margin: 0;
  color: var(--label-2);
  font-size: 13px;
  font-weight: 600;
}
.sub {
  margin: 4px 0 0;
  color: var(--label-2);
  font-size: 13px;
}
.action {
  display: block;
  width: 100%;
  height: 57px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 20px;
  letter-spacing: -0.02em;
}
.action:active {
  background: var(--fill-2);
}
.destructive {
  border-top: 0.5px solid var(--separator);
  color: var(--danger);
}
.cancel {
  font-weight: 600;
  background: var(--bg-elevated);
}
.cancel:focus-visible,
.destructive:focus-visible {
  outline: none;
  background: var(--fill);
}

.as-enter-active,
.as-leave-active {
  transition: background 0.3s;
}
.as-enter-active .sheet,
.as-leave-active .sheet {
  transition: transform 0.35s var(--ease-ios);
}
.as-enter-from,
.as-leave-to {
  background: transparent;
}
.as-enter-from .sheet,
.as-leave-to .sheet {
  transform: translateY(110%);
}

/* ---------- compact height (phone held sideways) ----------
   Still an action sheet: bottom-anchored, centred at a limited width, clear of the
   notch and home indicator. If the screen is too short it scrolls instead of
   clipping the title off the top (auto margin, not flex-end alignment). */
@media (max-height: 539.98px) {
  .overlay {
    align-items: flex-start;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px max(8px, var(--safe-l), var(--safe-r)) calc(8px + var(--safe-b));
  }
  .sheet {
    max-width: 400px;
    margin-top: auto;
  }
}
@media (max-height: 299.98px) {
  .action {
    height: 48px;
    font-size: 18px;
  }
  .msg {
    padding: 10px 16px;
  }
}

/* ---------- desktop: centered alert ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .overlay {
    align-items: center;
    padding: 16px;
  }
  .sheet {
    width: 290px;
    gap: 0;
    overflow: hidden;
    border-radius: 14px;
    background: var(--material-thick);
    backdrop-filter: blur(30px) saturate(1.8);
    -webkit-backdrop-filter: blur(30px) saturate(1.8);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }
  .group,
  .cancel {
    border-radius: 0;
    background: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .sheet {
    flex-direction: column-reverse;
  }
  .group {
    display: contents;
  }
  .msg {
    order: 3;
    padding: 20px 16px 16px;
  }
  .title {
    color: var(--label);
    font-size: 17px;
  }
  .sub {
    color: var(--label);
  }
  .action {
    height: 44px;
    font-size: 17px;
    border-top: 0.5px solid var(--separator);
  }
  .destructive {
    order: 2;
    font-weight: 600;
  }
  .cancel {
    order: 1;
    font-weight: 400;
  }
  .as-enter-from .sheet,
  .as-leave-to .sheet {
    transform: scale(1.1);
    opacity: 0;
  }
  .as-enter-active .sheet,
  .as-leave-active .sheet {
    transition: transform 0.25s var(--ease-ios), opacity 0.2s;
  }
}
</style>
