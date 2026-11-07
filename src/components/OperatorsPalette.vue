<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { drag, swipeScroll } from '../composables/useDrag'
import { state } from '../store/board'
import NameSticky from './NameSticky.vue'

const emit = defineEmits<{ operatorTap: [operatorId: string] }>()
const expanded = ref(false)

// Picking a name up from the expanded grid collapses the tray so the duties are visible.
watch(
  () => drag.active,
  (active) => {
    if (active) expanded.value = false
  },
)

const removing = computed(() => drag.active && !!drag.payload?.assignmentId && drag.over?.kind === 'remove')
</script>

<template>
  <aside class="palette" :class="{ expanded, removing }" data-drop="remove" data-bottom-overlay aria-label="Operators">
    <button
      type="button"
      class="head"
      :aria-expanded="expanded"
      :aria-label="expanded ? 'Collapse operators' : 'Show all operators'"
      @click="expanded = !expanded"
    >
      <span class="grab" aria-hidden="true" />
      <span class="titles">
        <strong>Operators</strong>
        <span class="hint desktop">Drag your name into a duty column. Drag it back here to remove it.</span>
        <span class="hint mobile">{{ expanded ? 'Scroll to browse · hold a name to drag it' : 'Swipe to browse · drag a name up onto a duty' }}</span>
      </span>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div class="list" v-on="swipeScroll">
      <NameSticky
        v-for="op in state.operators"
        :key="op.id"
        :operator="op"
        variant="palette"
        @tap="emit('operatorTap', op.id)"
      />
    </div>
  </aside>
</template>

<style scoped>
/* ---------- mobile (base): iOS bottom sheet (material) ---------- */
.palette {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  padding-bottom: var(--safe-b);
  background: var(--material);
  backdrop-filter: saturate(1.8) blur(24px);
  -webkit-backdrop-filter: saturate(1.8) blur(24px);
  border-radius: 14px 14px 0 0;
  box-shadow: 0 -0.5px 0 var(--separator), 0 -8px 28px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.15s;
}
.head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 14px 12px 4px 16px;
  border: 0;
  background: none;
  text-align: left;
}
.grab {
  position: absolute;
  top: 5px;
  left: 50%;
  width: 36px;
  height: 5px;
  margin-left: -18px;
  border-radius: 3px;
  background: var(--label-3);
}
.titles {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.titles strong {
  font-size: 17px;
  font-weight: 600;
}
.hint {
  overflow: hidden;
  color: var(--label-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.desktop {
  display: none;
}
.chev {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  padding: 6px;
  border-radius: 50%;
  background: var(--fill);
  color: var(--label-2);
  transition: transform 0.3s var(--ease-ios);
}
.expanded .chev {
  transform: rotate(180deg);
}
.list {
  display: flex;
  gap: 10px;
  padding: 8px 16px 14px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding: 0 16px;
  scrollbar-width: none;
  cursor: grab;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 28px), transparent);
  mask-image: linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 28px), transparent);
}
.list::-webkit-scrollbar {
  display: none;
}
.expanded .list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  justify-items: center;
  /* Tall phones: up to 60% of the screen. Short screens: whatever the sheet has
     left under its header (see the flex column below), so every row stays reachable. */
  flex: 1 1 auto;
  min-height: 0;
  max-height: 60vh;
  max-height: 60dvh;
  padding-bottom: 20px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: none;
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 28px), transparent);
  mask-image: linear-gradient(180deg, #000 calc(100% - 28px), transparent);
}
/* Expanded sheet never grows past the screen: header + a list that fills the rest */
@media (max-width: 767.98px) {
  .palette.expanded {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - var(--safe-t) - 12px);
    max-height: calc(100dvh - var(--safe-t) - 12px);
  }
  .expanded .head {
    flex: 0 0 auto;
  }
}
/* Expanded grid: vertical swipes scroll; long-press picks a name up */
.expanded .list :deep(.v-palette) {
  touch-action: manipulation;
}
.removing {
  box-shadow: inset 0 0 0 2px var(--danger);
}

/* ---------- desktop: Miro side panel ---------- */
@media (min-width: 768px) {
  .palette {
    position: sticky;
    top: 16px;
    left: auto;
    right: auto;
    bottom: auto;
    z-index: 1;
    align-self: flex-start;
    width: 196px;
    flex: 0 0 196px;
    padding: 0;
    background: var(--palette-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border: 0;
    border-radius: 22px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    overflow: hidden;
  }
  .head {
    justify-content: center;
    padding: 12px 14px;
    background: var(--palette-head);
    border-radius: 22px;
    text-align: center;
    cursor: default;
    pointer-events: none;
  }
  .grab,
  .chev,
  .mobile {
    display: none;
  }
  .titles {
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .titles strong {
    color: #1a1a1f;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .desktop {
    display: block;
    color: #1a1a1f;
    font-size: 11px;
    line-height: 1.3;
    white-space: normal;
  }
  .list,
  .expanded .list {
    display: grid;
    grid-template-columns: repeat(3, 54px);
    justify-content: center;
    gap: 9px;
    max-height: none;
    padding: 14px 10px 20px;
    overflow: visible;
    cursor: default;
    -webkit-mask-image: none;
    mask-image: none;
  }
}
</style>
