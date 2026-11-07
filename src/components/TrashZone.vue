<script setup lang="ts">
import { computed } from 'vue'
import { drag } from '../composables/useDrag'

// Shown only while dragging a placed sticky (palette drags are copies — nothing to remove).
const visible = computed(() => drag.active && !!drag.payload?.assignmentId)
const hot = computed(() => drag.over?.kind === 'remove')
</script>

<template>
  <Transition name="trash">
    <div v-if="visible" class="trash" :class="{ hot }" data-drop="remove" role="region" aria-label="Remove zone">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="label" :class="{ 'sr-only': hot }">{{ hot ? 'Release to remove' : 'Drop here to remove' }}</span>
    </div>
  </Transition>
  <!-- Hot: the dragged sticky sits right over the zone, so the label moves to a chip on
       the zone's top edge, stacked above the drag ghost (z-index 200) — always readable. -->
  <Transition name="chip">
    <div v-if="visible && hot" class="chip" aria-hidden="true">Release to remove</div>
  </Transition>
</template>

<style scoped>
/* ---------- mobile (base): covers the operators tray (also a remove target) ---------- */
.trash {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  /* exactly the collapsed tray (var(--tray-h) is 118px in compact height); content clears the notch */
  height: calc(var(--tray-h) + var(--safe-b));
  padding: 0 max(16px, var(--safe-r)) var(--safe-b) max(16px, var(--safe-l));
  border-radius: 14px 14px 0 0;
  background: var(--material);
  backdrop-filter: saturate(1.8) blur(24px);
  -webkit-backdrop-filter: saturate(1.8) blur(24px);
  color: var(--danger);
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 -0.5px 0 var(--separator), 0 -8px 28px rgba(0, 0, 0, 0.1);
  transition: background 0.15s, color 0.15s;
}
.trash svg {
  width: 28px;
  height: 28px;
}
.hot {
  background: var(--danger-fill);
  border-color: var(--danger-fill);
  color: #fff;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.chip {
  position: fixed;
  left: 50%;
  /* straddles the tray cover's top edge */
  bottom: calc(var(--tray-h) + var(--safe-b) - 15px);
  z-index: 210;
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 14px;
  translate: -50% 0;
  border-radius: 999px;
  background: #fff;
  color: var(--danger);
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 4px 14px rgba(0, 0, 0, 0.22);
  pointer-events: none; /* never the drop target under the pointer */
}
.chip-enter-active,
.chip-leave-active {
  transition: opacity 0.12s, scale 0.12s;
}
.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  scale: 0.9;
}
/* Compact height: icon beside the label so it reads well in the shorter zone */
@media (max-height: 539.98px) {
  .trash {
    flex-direction: row;
    gap: 10px;
  }
}
.trash-enter-active,
.trash-leave-active {
  transition: opacity 0.15s, translate 0.15s;
}
.trash-enter-from,
.trash-leave-to {
  opacity: 0;
  translate: 0 12px;
}

/* ---------- desktop: floating pill ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .trash {
    left: 50%;
    right: auto;
    bottom: 24px;
    flex-direction: row;
    gap: 10px;
    width: 280px;
    height: 64px;
    padding: 0;
    transform: translateX(-50%);
    border: 2px dashed #e9a3a6;
    border-radius: 16px;
    background: rgba(255, 240, 240, 0.96);
    font-size: 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }
  .trash svg {
    width: 22px;
    height: 22px;
  }
  .hot {
    background: var(--danger-fill);
    transform: translateX(-50%) scale(1.04);
  }
  .chip {
    bottom: calc(24px + 64px - 15px);
    font-size: 13px;
  }
}
</style>
