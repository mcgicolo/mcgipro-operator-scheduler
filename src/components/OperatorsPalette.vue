<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { drag, swipeScroll } from '../composables/useDrag'
import { state } from '../store/board'
import NameSticky from './NameSticky.vue'

const emit = defineEmits<{ operatorTap: [operatorId: string] }>()
const expanded = ref(false)
const listEl = ref<HTMLElement | null>(null)
/** The collapsed (one-row) tray has more names than fit — only then is expanding useful. */
const overflows = ref(true)
const canExpand = computed(() => expanded.value || overflows.value)

// Picking a name up from the expanded grid collapses the tray so the duties are visible.
watch(
  () => drag.active,
  (active) => {
    if (active) expanded.value = false
  },
)

const removing = computed(() => drag.active && !!drag.payload?.assignmentId && drag.over?.kind === 'remove')

function toggle() {
  if (!canExpand.value) return
  expanded.value = !expanded.value
}

/** Measured only while collapsed (the expanded grid scrolls vertically, so it says nothing). */
function measure() {
  const list = listEl.value
  if (!list || expanded.value) return
  overflows.value = list.scrollWidth > list.clientWidth + 1
}

/** Mouse wheel over the collapsed tray scrolls it sideways instead of scrolling the page. */
function onWheel(e: WheelEvent) {
  const list = listEl.value
  if (!list || expanded.value || e.ctrlKey) return
  if (list.scrollWidth <= list.clientWidth + 1) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? list.clientWidth : 1
  list.scrollBy({ left: e.deltaY * unit })
  e.preventDefault()
}

const desktopMq = typeof matchMedia === 'function' ? matchMedia('(min-width: 768px) and (min-height: 540px)') : null
function onDesktopChange(e: MediaQueryListEvent) {
  if (e.matches) expanded.value = false
}

let ro: ResizeObserver | null = null
onMounted(() => {
  const list = listEl.value
  if (list) {
    list.addEventListener('wheel', onWheel, { passive: false })
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure)
      ro.observe(list)
    }
  }
  desktopMq?.addEventListener('change', onDesktopChange)
  measure()
})
onBeforeUnmount(() => {
  listEl.value?.removeEventListener('wheel', onWheel)
  ro?.disconnect()
  desktopMq?.removeEventListener('change', onDesktopChange)
})
// Names added/removed don't resize the list box itself; re-measure after collapsing too.
watch([() => state.operators.length, expanded], () => nextTick(measure))
</script>

<template>
  <aside class="palette" :class="{ expanded, removing }" data-drop="remove" data-bottom-overlay aria-label="Operators">
    <button
      type="button"
      class="head"
      :class="{ fixed: !canExpand }"
      :aria-expanded="canExpand ? expanded : undefined"
      :aria-label="canExpand ? (expanded ? 'Collapse operators' : 'Show all operators') : undefined"
      @click="toggle"
    >
      <span class="grab" aria-hidden="true" />
      <span class="titles">
        <strong>Operators</strong>
        <span class="hint desktop">Drag your name into a duty column. Drag it back here to remove it.</span>
        <span class="hint mobile touch">{{ expanded ? 'Scroll to browse · hold a name to drag it' : overflows ? 'Swipe to browse · drag a name up onto a duty' : 'Drag a name up onto a duty' }}</span>
        <span class="hint mobile mouse">{{ !expanded && overflows ? 'Scroll to browse · drag a name onto a duty' : 'Drag a name onto a duty' }}</span>
      </span>
      <svg v-show="canExpand" class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div ref="listEl" class="list" v-on="swipeScroll">
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
  /* content clears the notch / rounded corners when held sideways; background stays edge-to-edge */
  padding: 14px max(12px, var(--safe-r)) 4px max(16px, var(--safe-l));
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
  --pad-l: max(16px, var(--safe-l));
  --pad-r: max(16px, var(--safe-r));
  padding: 8px var(--pad-r) 14px var(--pad-l);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding: 0 var(--pad-r) 0 var(--pad-l);
  scrollbar-width: none;
  cursor: grab;
  /* Edge fades are measured from where the notes start/end (the padding edge), so the first
     note is never faded and the notch side stays clean. With no inset this is 0→14px / -28px→100%. */
  --fade: linear-gradient(
    90deg,
    transparent calc(var(--pad-l) - 16px),
    #000 calc(var(--pad-l) - 2px),
    #000 calc(100% - var(--pad-r) - 12px),
    transparent calc(100% - var(--pad-r) + 16px)
  );
  -webkit-mask-image: var(--fade);
  mask-image: var(--fade);
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
  /* Scroll room under the last row: the 28px bottom fade + 24px breathing room + the home
     indicator / Safari toolbar inset (the sheet drops its own safe-area padding when
     expanded, so the grid scrolls to the screen edge). The fade only ever covers padding. */
  --end-pad: calc(28px + 24px + var(--safe-b));
  padding-bottom: var(--end-pad);
  scroll-padding-bottom: var(--end-pad);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: none;
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 28px), transparent);
  mask-image: linear-gradient(180deg, #000 calc(100% - 28px), transparent);
}
/* Expanded sheet never grows past the screen: header + a list that fills the rest */
@media (max-width: 767.98px), (max-height: 539.98px) {
  .palette.expanded {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - var(--safe-t) - 12px);
    max-height: calc(100dvh - var(--safe-t) - 12px);
    padding-bottom: 0; /* moved into the list's --end-pad */
  }
  .expanded .head {
    flex: 0 0 auto;
  }
}
/* Compact height (phone held sideways): the collapsed tray fits var(--tray-h) (118px):
   44px head (title + hint on one line) + 4 + 62px notes + 8. */
@media (max-height: 539.98px) {
  .head {
    min-height: 44px;
    padding-top: 8px;
    padding-bottom: 0;
  }
  .grab {
    top: 4px;
  }
  .titles {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }
  .titles strong {
    flex: 0 0 auto;
  }
  .hint {
    min-width: 0;
  }
  .list {
    gap: 8px;
    padding-top: 4px;
    padding-bottom: 8px;
  }
  .list :deep(.v-palette) {
    width: 62px;
    height: 62px;
    padding: 4px;
    border-radius: 12px;
    font-size: 11px;
  }
  /* Expanded: a wide, short screen — more columns, and the list takes all the height
     the sheet has left under its header instead of stopping at 60%. */
  .expanded .list {
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 10px 8px;
    max-height: none;
    padding-top: 6px;
    padding-bottom: var(--end-pad);
  }
}
/* Expanded grid: vertical swipes scroll; long-press picks a name up */
.expanded .list :deep(.v-palette) {
  touch-action: manipulation;
}
.removing {
  box-shadow: inset 0 0 0 2px var(--danger);
}
/* Nothing to expand (every name fits in one row): the head is just a label. */
.head.fixed {
  cursor: default;
}
/* Mouse/trackpad: wheel-scroll wording; touch keeps the swipe / hold wording. */
.mouse {
  display: none;
}
@media (hover: hover) and (pointer: fine) {
  .touch {
    display: none;
  }
  .mouse {
    display: block;
  }
}

/* ---------- desktop: Miro side panel ---------- */
@media (min-width: 768px) and (min-height: 540px) {
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
  .palette.removing {
    box-shadow: inset 0 0 0 2px var(--danger), 0 1px 2px rgba(0, 0, 0, 0.06);
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
