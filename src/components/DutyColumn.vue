<script setup lang="ts">
import { computed } from 'vue'
import type { Schedule } from '../config/types'
import { drag } from '../composables/useDrag'
import { assignmentsBySchedule, findAssignment, operatorsById } from '../store/board'
import { formatTime } from '../utils/format'
import NameSticky from './NameSticky.vue'

const props = defineProps<{ schedule: Schedule }>()
const emit = defineEmits<{ chipTap: [assignmentId: string] }>()

const items = computed(() =>
  (assignmentsBySchedule.value[props.schedule.id] ?? []).flatMap((a) => {
    const op = operatorsById.value.get(a.operator_id)
    return op ? [{ a, op }] : []
  }),
)

const isOver = computed(() => drag.active && drag.over?.kind === 'schedule' && drag.over.id === props.schedule.id)
/** Hovering with an operator who is already in this duty (and isn't the chip being moved from here). */
const isDup = computed(() => {
  if (!isOver.value || !drag.payload) return false
  if (drag.payload.fromScheduleId === props.schedule.id) return false
  return !!findAssignment(drag.payload.operatorId, props.schedule.id)
})
const shaking = computed(() => drag.rejected === props.schedule.id)
const isLive = computed(() => props.schedule.mode === 'LIVE')
</script>

<template>
  <section
    class="duty"
    role="group"
    :class="[isLive ? 'live' : 'playback', { over: isOver && !isDup, dup: isDup, shake: shaking }]"
    :data-drop="`schedule:${schedule.id}`"
    :aria-label="`${schedule.mode} ${schedule.day} ${formatTime(schedule.time)}, ${items.length} operator${items.length === 1 ? '' : 's'}`"
  >
    <header class="head">
      <span class="icon" aria-hidden="true">
        <svg v-if="isLive" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
      </span>
      <span class="text">
        <span class="when"><b>{{ schedule.day }}</b> {{ formatTime(schedule.time) }}</span>
        <span class="mode">{{ isLive ? 'LIVE' : 'Playback' }}</span>
      </span>
      <span v-if="items.length" class="count" :aria-label="`${items.length} assigned`">{{ items.length }}</span>
    </header>
    <div class="body">
      <TransitionGroup name="pop">
        <NameSticky
          v-for="{ a, op } in items"
          :key="a.id"
          :operator="op"
          :assignment="a"
          variant="chip"
          @tap="emit('chipTap', a.id)"
        />
      </TransitionGroup>
      <p v-if="!items.length || (isOver && !isDup)" class="empty">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        <span>{{ isOver ? 'Release' : 'Drop a name' }}</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ---------- mobile (base): iOS inset-grouped row ---------- */
.duty {
  --accent: var(--ios-blue);
  --soft: var(--tint-playback);
  position: relative;
  display: flex;
  flex-direction: column;
  /* 16px is enough sideways too: .board (App.vue) already insets the whole card past the notch */
  padding: 11px 16px 12px;
  background: var(--bg-cell);
  transition: background 0.15s;
}
.live {
  --accent: var(--ios-red);
  --soft: var(--tint-live);
}
/* hairline separator, inset to the text like UITableView */
.duty + .duty::before {
  content: '';
  position: absolute;
  top: 0;
  left: 58px;
  right: 0;
  height: 0.5px;
  background: var(--separator);
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 30px;
}
.icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
}
.icon svg {
  width: 19px;
  height: 19px;
}
.text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.when {
  font-size: 17px;
  line-height: 22px;
}
.when b {
  font-weight: 600;
}
.mode {
  color: var(--label-2);
  font-size: 13px;
  line-height: 16px;
}
.live .mode {
  color: var(--accent);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.count {
  display: grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 12px;
  background: var(--fill);
  color: var(--label-2);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 10px;
  padding: 14px 0 4px 42px;
}
/* Empty slot shaped like a sticky note */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 78px;
  height: 78px;
  margin: 0;
  border: 1.5px dashed var(--label-3);
  border-radius: 14px;
  color: var(--label-2); /* text needs 4.5:1; the dashed border stays subtle */
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}
.empty svg {
  width: 20px;
  height: 20px;
  color: var(--label-3);
}
.over .empty svg {
  color: inherit;
}
.over {
  background: var(--soft);
}
.over .empty {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
}
.dup {
  background: var(--fill);
}
.shake {
  animation: shake 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

/* Compact height (phone held sideways): the screen is wide but short, so the duty label
   sits beside its notes instead of above them, and the notes shrink to 64px — a row
   is ~80px tall and fits between the nav and the tray. */
@media (max-height: 539.98px) {
  .duty {
    flex-direction: row;
    align-items: flex-start;
    gap: 12px;
    padding-top: 10px;
    padding-bottom: 8px;
  }
  .head {
    flex: 0 0 196px;
    min-height: 64px; /* centred on the first row of notes */
  }
  .body {
    flex: 1 1 auto;
    min-width: 0;
    gap: 10px 8px;
    padding: 0;
  }
  .empty {
    width: 64px;
    height: 64px;
    border-radius: 12px;
  }
}

.pop-enter-active {
  transition: transform 0.3s var(--ease-ios), opacity 0.2s;
}
.pop-enter-from {
  transform: scale(0.6);
  opacity: 0;
}

/* ---------- desktop: Miro-like column ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .duty {
    --accent: var(--playback);
    --soft: #eaf2ff;
    flex: 1 1 0;
    min-width: 100px;
    max-width: 170px;
    padding: 0;
    background: none;
  }
  .live {
    --accent: var(--live);
    --soft: #fdeeee;
  }
  .duty + .duty::before,
  .icon,
  .count,
  .empty {
    display: none;
  }
  .head {
    justify-content: center;
    min-height: 46px;
    padding: 6px 8px;
    border-radius: 6px 6px 0 0;
    background: var(--accent);
    color: #fff;
    text-align: center;
  }
  .text {
    flex: none;
    flex-direction: column-reverse;
    gap: 1px;
  }
  .when,
  .mode,
  .live .mode {
    color: #fff;
    font-size: 12px;
    line-height: 1.25;
    letter-spacing: 0.01em;
  }
  .when b {
    font-weight: 400;
  }
  .mode {
    font-weight: 700;
    text-transform: uppercase;
  }
  .body {
    flex: 1;
    align-items: flex-start;
    align-content: flex-start;
    gap: 6px;
    /* Fill to the viewport bottom without scrolling the page. 276px = column-body top
       (209px, measured at 768–1920px wide) + .groups/.board bottom padding (12 + 40px)
       + 15px headroom for a classic (non-overlay) horizontal scrollbar.
       Re-measure if the desktop top bar / group header height changes. */
    min-height: max(260px, calc(100vh - 276px));
    min-height: max(260px, calc(100dvh - 276px));
    padding: 8px 6px;
    background: var(--col-bg);
    border: 1px solid var(--col-border);
    border-top: 0;
    border-radius: 0 0 4px 4px;
    transition: background 0.12s, box-shadow 0.12s;
  }
  .body:empty {
    display: flex;
  }
  .over,
  .dup {
    background: none;
  }
  .over .body {
    background: var(--soft);
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .dup .body {
    background: var(--col-bg);
    box-shadow: inset 0 0 0 2px #9a9ca8;
  }
}
/* Dark mode: #3a3a3c column borders vanish on the dark canvas; lift them toward --ink-2.
   The drag-over fill is mixed from the accent into the dark column instead of the light
   pastel hex (which turned near-white). */
@media (min-width: 768px) and (min-height: 540px) and (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .body {
    border-color: color-mix(in srgb, var(--col-border) 72%, var(--ink-2));
  }
  :root:not([data-theme='light']) .duty {
    --soft: color-mix(in srgb, var(--accent) 22%, var(--col-bg));
  }
}
@media (min-width: 768px) and (min-height: 540px) {
  :root[data-theme='dark'] .body {
    border-color: color-mix(in srgb, var(--col-border) 72%, var(--ink-2));
  }
  :root[data-theme='dark'] .duty {
    --soft: color-mix(in srgb, var(--accent) 22%, var(--col-bg));
  }
}
</style>
