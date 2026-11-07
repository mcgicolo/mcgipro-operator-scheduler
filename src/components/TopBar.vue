<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { buildScheduleText, groups, state, toast } from '../store/board'
import ThemeSwitch from './ThemeSwitch.vue'

const emit = defineEmits<{ editName: [] }>()

const fallbackText = ref<string | null>(null)
const textarea = ref<HTMLTextAreaElement>()
const largeTitle = ref<HTMLElement>()
const collapsed = ref(false)
const activeGroup = ref<string | null>(null)

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
const title = computed(() => titleCase(state.title))

const status = computed(() => {
  if (state.backendKind === 'local') return { cls: 'demo', label: 'Demo mode' }
  if (state.connection === 'live') return { cls: 'live', label: 'Live' }
  if (state.connection === 'offline') return { cls: 'off', label: 'Reconnecting…' }
  return { cls: 'off', label: 'Connecting…' }
})

// Large title → inline title, and segmented-control scroll spy (iOS behaviour).
let raf = 0
function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const h1 = largeTitle.value?.querySelector('h1')
    const navBottom = document.querySelector('.navbar')?.getBoundingClientRect().bottom ?? 0
    collapsed.value = !!h1 && h1.getBoundingClientRect().bottom <= navBottom
    const seg = document.querySelector('.segbar')?.getBoundingClientRect().bottom ?? 0
    let current = groups.value[0]?.id ?? null
    for (const g of groups.value) {
      const el = document.getElementById(`group-${g.id}`)
      // A section becomes active once its header reaches the upper third of the visible list.
      if (el && el.getBoundingClientRect().top <= seg + (innerHeight - seg) * 0.33) current = g.id
    }
    // At the very bottom, the last section is the active one.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current = groups.value.at(-1)?.id ?? current
    activeGroup.value = current
  })
}
onMounted(() => {
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onBeforeUnmount(() => removeEventListener('scroll', onScroll))

function jump(id: string) {
  activeGroup.value = id
  document.getElementById(`group-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function copy() {
  const text = buildScheduleText()
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard')
    await navigator.clipboard.writeText(text)
    toast('Schedule copied — paste it in Messenger')
  } catch {
    fallbackText.value = text
    await nextTick()
    textarea.value?.focus()
    textarea.value?.select()
  }
}
</script>

<template>
  <header class="navbar" :class="{ collapsed }" data-top-overlay>
    <button type="button" class="nav-btn me" :title="`You are ${state.nickname} — tap to change`" @click="emit('editName')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8" />
        <circle cx="12" cy="10" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M5.8 18.6c1.4-2.2 3.6-3.3 6.2-3.3s4.8 1.1 6.2 3.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span class="nick">{{ state.nickname || 'Set name' }}</span>
    </button>
    <span class="inline-title" aria-hidden="true">{{ title }}</span>
    <span class="status" :class="status.cls"><i aria-hidden="true" />{{ status.label }}</span>
    <span class="right">
    <ThemeSwitch />
    <button type="button" class="nav-btn copy" aria-label="Copy schedule as text" @click="copy">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M15.5 5.5V5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span class="copy-label">Copy schedule</span>
    </button>
    </span>
  </header>

  <div ref="largeTitle" class="large">
    <h1>{{ title }}</h1>
    <p class="sub">
      <span class="month">Month of: <strong>{{ state.month }}</strong></span>
      <span v-if="state.instructions" class="instr"> • {{ state.instructions }}</span>
      <span class="status-inline" :class="status.cls"><i aria-hidden="true" />{{ status.label }}</span>
    </p>
  </div>

  <div class="segbar" :class="{ collapsed }" data-top-overlay>
    <div class="segmented" role="tablist" aria-label="Jump to gathering">
      <button
        v-for="g in groups"
        :key="g.id"
        type="button"
        role="tab"
        :aria-selected="activeGroup === g.id"
        :class="{ on: activeGroup === g.id }"
        @click="jump(g.id)"
      >
        {{ titleCase(g.name) }}
      </button>
    </div>
  </div>

  <div v-if="fallbackText !== null" class="overlay" role="dialog" aria-modal="true" aria-label="Copy schedule" @click.self="fallbackText = null">
    <div class="card">
      <h2>Copy Schedule</h2>
      <p>Select all and copy this text.</p>
      <textarea ref="textarea" readonly :value="fallbackText" rows="12" />
      <button type="button" class="btn primary" @click="fallbackText = null">Done</button>
    </div>
  </div>
</template>

<style scoped>
/* ---------- mobile (base): iOS navigation bar with large title ---------- */
.navbar {
  position: sticky;
  top: 0;
  z-index: 21;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: calc(var(--nav-h) + var(--safe-t));
  padding: var(--safe-t) 8px 0;
  background: var(--bg-grouped);
  transition: background 0.2s;
}
.navbar.collapsed {
  background: var(--material);
  backdrop-filter: saturate(1.8) blur(20px);
  -webkit-backdrop-filter: saturate(1.8) blur(20px);
}
.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 44px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 17px;
}
.nav-btn:active {
  opacity: 0.4;
}
.nav-btn svg {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
}
.me {
  justify-self: start;
  max-width: 100%;
}
.nick {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.right {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 6px;
}
.copy {
  justify-content: center;
}
.copy-label,
.status {
  display: none;
}
.inline-title {
  grid-column: 2;
  grid-row: 1;
  max-width: 52vw;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
}
.collapsed .inline-title {
  opacity: 1;
}

.large {
  padding: 2px 16px 8px;
}
h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 700;
  line-height: 41px;
  letter-spacing: 0.011em;
}
.sub {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0 0;
  color: var(--label-2);
  font-size: 15px;
}
.sub strong {
  color: var(--label);
  font-weight: 600;
}
.instr {
  display: none;
}
.status-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  background: var(--fill);
  font-size: 13px;
}
.status-inline i,
.status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--label-3);
}
.live i {
  background: var(--ios-green) !important;
}
.demo i {
  background: var(--ios-orange) !important;
}

.segbar {
  position: sticky;
  top: calc(var(--nav-h) + var(--safe-t));
  z-index: 20;
  padding: 6px 16px 10px;
  background: var(--bg-grouped);
  transition: background 0.2s, box-shadow 0.2s;
}
.segbar.collapsed {
  background: var(--material);
  backdrop-filter: saturate(1.8) blur(20px);
  -webkit-backdrop-filter: saturate(1.8) blur(20px);
  box-shadow: 0 0.5px 0 var(--separator);
}
.segmented {
  display: flex;
  padding: 2px;
  border-radius: 9px;
  background: var(--fill);
}
.segmented button {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  overflow: hidden;
  border: 0;
  border-radius: 7px;
  background: none;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 0.2s, box-shadow 0.2s;
}
.segmented button.on {
  background: var(--bg-elevated);
  font-weight: 600;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12), 0 3px 1px rgba(0, 0, 0, 0.04);
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
}
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(520px, 100%);
  padding: 20px;
  border-radius: 14px;
  background: var(--bg-elevated);
}
.card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.card p {
  margin: 0;
  color: var(--label-2);
  font-size: 15px;
}
textarea {
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 10px;
  background: var(--fill);
  color: var(--label);
  font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  resize: vertical;
}

/* ---------- desktop: Miro-style centered title, actions top-right ---------- */
@media (min-width: 768px) {
  .navbar,
  .navbar.collapsed {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
    height: auto;
    padding: 0;
    background: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .inline-title,
  .segbar,
  .status-inline {
    display: none;
  }
  .status {
    order: -1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-size: 12px;
    white-space: nowrap;
  }
  .nav-btn {
    height: 40px;
    padding: 0 16px 0 10px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
  }
  .me {
    border: 1px solid var(--col-border);
    background: var(--surface);
    color: var(--ink);
  }
  .nick {
    max-width: 140px;
  }
  .nav-btn svg {
    width: 20px;
    height: 20px;
  }
  .copy {
    background: var(--ink);
    color: var(--surface);
  }
  .copy-label {
    display: inline;
  }
  .large {
    padding: 26px 20px 18px;
    text-align: center;
  }
  h1 {
    font-size: 30px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  .sub {
    justify-content: center;
    gap: 0;
    margin-top: 6px;
    color: var(--ink-2);
    font-size: 13px;
  }
  .sub strong {
    color: var(--ink);
  }
  .instr {
    display: inline;
    white-space: pre;
  }
}
@media (min-width: 768px) and (max-width: 1199.98px) {
  .large {
    padding-right: 420px;
    text-align: left;
  }
  .sub {
    justify-content: flex-start;
  }
  .instr {
    display: none;
  }
}
</style>
