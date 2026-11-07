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
watch(
  () => state.confirmRemoveId,
  async (id) => {
    if (id) {
      await nextTick()
      cancelBtn.value?.focus()
    }
  },
)

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

/* ---------- desktop: centered alert ---------- */
@media (min-width: 768px) {
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
