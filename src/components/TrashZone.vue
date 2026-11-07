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
      <span>{{ hot ? 'Release to remove' : 'Drop here to remove' }}</span>
    </div>
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
  height: calc(var(--tray-h) + var(--safe-b));
  padding-bottom: var(--safe-b);
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
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
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
@media (min-width: 768px) {
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
    background: var(--danger);
    transform: translateX(-50%) scale(1.04);
  }
}
</style>
