<script setup lang="ts">
import { computed } from 'vue'
import type { Assignment, Operator } from '../config/types'
import { draggable, clickSuppressed, drag } from '../composables/useDrag'
import { requestRemove, state } from '../store/board'
import { relativeTime } from '../utils/format'

const props = defineProps<{
  operator: Operator
  assignment?: Assignment
  variant: 'palette' | 'chip'
}>()
const emit = defineEmits<{ tap: [] }>()

const handlers = draggable(() => ({
  operatorId: props.operator.id,
  assignmentId: props.assignment?.id ?? null,
  fromScheduleId: props.assignment?.schedule_id ?? null,
  name: props.operator.name,
  color: props.operator.color,
}))

const info = computed(() =>
  props.assignment ? `moved by ${props.assignment.moved_by} · ${relativeTime(props.assignment.moved_at, state.now)}` : '',
)

const isLifted = computed(
  () => drag.active && !!props.assignment && drag.payload?.assignmentId === props.assignment.id,
)

function onClick() {
  if (clickSuppressed()) return
  emit('tap')
}

function remove() {
  if (props.assignment) requestRemove(props.assignment.id)
}
</script>

<template>
  <div
    class="sticky"
    :class="[`v-${variant}`, { lifted: isLifted }]"
    :style="{ '--c': operator.color }"
    role="button"
    tabindex="0"
    :title="assignment ? `${operator.name} — ${info}` : `${operator.name} — drag into a duty, or tap`"
    :aria-label="assignment ? `${operator.name}, ${info}. Tap for options.` : `${operator.name}. Tap to assign duties.`"
    v-on="handlers"
    @click="onClick"
    @keydown.enter.self.prevent="emit('tap')"
    @keydown.space.self.prevent="emit('tap')"
  >
    <span class="name">{{ operator.name }}</span>
    <button
      v-if="assignment"
      type="button"
      class="remove"
      :aria-label="`Remove ${operator.name}`"
      title="Remove"
      @mousedown.stop
      @touchstart.stop
      @click.stop="remove"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* ---------- mobile (base, iOS) ---------- */
.sticky {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  background: var(--c);
  color: var(--sticky-ink);
  text-align: center;
  line-height: 1.2;
  letter-spacing: -0.01em;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: grab;
  outline: none;
  transition: transform 0.2s var(--ease-ios), opacity 0.15s ease, box-shadow 0.15s ease;
}
.sticky:active {
  transform: scale(0.95);
}
.lifted {
  opacity: 0.25;
  transform: scale(0.95);
}
.name {
  min-width: 0;
  overflow-wrap: normal;
  pointer-events: none;
}

/* Sticky note (tray + placed): rounded square note */
.v-palette,
.v-chip {
  flex: 0 0 auto;
  width: 78px;
  height: 78px;
  padding: 6px;
  border-radius: 14px;
  font-size: 12.5px;
  font-weight: 600;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06), 0 6px 14px rgba(0, 0, 0, 0.08);
}
.v-palette {
  scroll-snap-align: start;
  /* sideways = browser scrolls the tray; upward = we pick the sticky up */
  touch-action: pan-x;
}

/* Remove badge on a placed note (like the iOS home-screen delete badge) */
.remove {
  position: absolute;
  top: -7px;
  right: -7px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2px solid var(--bg-cell);
  border-radius: 50%;
  background: #8e8e93;
  color: #fff;
  cursor: pointer;
}
/* 44pt hit area without growing the badge */
.remove::before {
  content: '';
  position: absolute;
  inset: -10px;
}
.remove svg {
  width: 11px;
  height: 11px;
}
.remove:active {
  background: #636366;
}

/* Compact height (phone held sideways): smaller placed notes so a duty row fits between
   the nav and the tray. (Tray notes are sized by OperatorsPalette.) */
@media (max-height: 539.98px) {
  .v-chip {
    width: 64px;
    height: 64px;
    padding: 4px;
    border-radius: 12px;
    font-size: 11.5px;
  }
  /* ✕ keeps a 44×44 hit area, pushed out past the corner so it covers less of the smaller
     note (a press near the middle should pick the note up, not hit ✕). */
  .remove::before {
    inset: -14px -14px -6px -6px;
  }
}

/* ---------- desktop: Miro-like square stickies ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .sticky {
    display: flex;
    box-shadow: var(--sticky-shadow);
  }
  .sticky:hover {
    box-shadow: 0 2px 2px rgba(0, 0, 0, 0.08), 0 6px 12px rgba(0, 0, 0, 0.14);
  }
  .v-palette,
  .v-chip {
    width: 54px;
    height: 54px;
    padding: 2px;
    gap: 0;
    border-radius: 2px;
    font-size: 10px;
    font-weight: 400;
    letter-spacing: normal;
    white-space: normal;
  }
  .remove {
    top: -7px;
    right: -7px;
    width: 18px;
    height: 18px;
    border: 0;
    background: #3a3a3c;
    color: #fff;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 0.12s, transform 0.12s;
  }
  .remove::before {
    inset: -4px;
  }
  .remove svg {
    width: 10px;
    height: 10px;
  }
  .sticky:hover .remove,
  .sticky:focus-within .remove {
    opacity: 1;
    transform: none;
  }
  .remove:hover {
    background: var(--live);
  }
}
@media (min-width: 768px) and (min-height: 540px) and (hover: none) {
  .remove {
    opacity: 1;
    transform: none;
  }
}
</style>
