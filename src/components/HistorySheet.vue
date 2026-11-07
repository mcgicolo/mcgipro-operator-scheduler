<script setup lang="ts">
// Paper trail (iOS page sheet): who added, moved or removed which sticky, and when.
//  - list: search + All/Added/Moved/Removed filter, grouped by day, newest first, live
//  - tap a row → detail view pushed inside the sheet (iOS navigation), with the sticky's
//    whole trail and "Show on Board"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { HistoryAction, HistoryEvent } from '../config/types'
import { groups, operatorsById, state, visibleScheduleIds } from '../store/board'
import { history, isMine, loadMoreHistory, markHistorySeen, refreshHistory } from '../store/history'
import { formatTime } from '../utils/format'
import { buildEntries, byDay, clockTime, dayTitle, fullDateTime, rowTime, type HistoryEntry } from '../utils/history'
import GatheringIcon from './GatheringIcon.vue'

const props = defineProps<{ initialQuery?: string }>()
const emit = defineEmits<{ close: []; showOnBoard: [assignmentId: string] }>()

type Filter = 'all' | HistoryAction
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'add', label: 'Added' },
  { id: 'move', label: 'Moved' },
  { id: 'remove', label: 'Removed' },
]

const panel = ref<HTMLElement>()
const scroller = ref<HTMLElement>()
const sentinel = ref<HTMLElement>()
const backBtn = ref<HTMLButtonElement>()
const searchInput = ref<HTMLInputElement>()
const query = ref(props.initialQuery ?? '')
const filter = ref<Filter>('all')
const detail = ref<HistoryEntry | null>(null)
let detailOpener: HTMLElement | null = null

// Entries by other people that arrived since this device last looked get a blue dot (like
// unread mail); entries that arrive while the sheet is open flash in.
const seenAtOpen = history.seenId ?? Number.MAX_SAFE_INTEGER
const newestAtOpen = history.events[0]?.id ?? 0
const isUnseen = (e: HistoryEntry) => e.id > seenAtOpen && e.clientId !== state.clientId
const isFresh = (e: HistoryEntry) => e.id > newestAtOpen

// ---------------------------------------------------------------- labels

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

/** schedule id → its gathering (name in title case: config names are often all caps) and a
 *  short "Live · Sun 8:00 AM" label. */
const places = computed(() => {
  const m = new Map<string, { g: (typeof groups.value)[number]; label: string }>()
  for (const g of groups.value) {
    const gg = { ...g, name: titleCase(g.name) }
    for (const s of g.schedules) m.set(s.id, { g: gg, label: `${s.mode === 'LIVE' ? 'Live' : 'Playback'} · ${s.day} ${formatTime(s.time)}` })
  }
  return m
})
const place = (id: string | null) => (id ? places.value.get(id) : undefined)
const placeText = (id: string | null) => {
  const p = place(id)
  return p ? `${p.g.name} ${p.label}` : 'a duty no longer on the board'
}
const opName = (id: string) => operatorsById.value.get(id)?.name ?? 'Removed operator'
const opColor = (id: string) => operatorsById.value.get(id)?.color ?? 'var(--fill-2)'
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
const who = (e: { actor: string | null; clientId: string | null }) =>
  e.clientId && e.clientId === state.clientId ? 'You' : e.actor || 'Someone'
const VERB: Record<HistoryAction, string> = { add: 'Added to', move: 'Moved to', remove: 'Removed from' }
const PAST: Record<HistoryAction, string> = { add: 'added', move: 'moved', remove: 'removed' }
const target = (e: { action: HistoryAction; from: string | null; to: string | null }) => (e.action === 'remove' ? e.from : e.to)

function sentence(e: HistoryEntry): string {
  const where = e.action === 'move' ? `to ${placeText(e.to)}, from ${placeText(e.from)}` : `${e.action === 'add' ? 'to' : 'from'} ${placeText(target(e))}`
  return `${who(e)} ${PAST[e.action]} ${opName(e.operatorId)} ${where}, ${rowTime(e.at, state.now)}`
}

// ---------------------------------------------------------------- list

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const entries = computed(() => buildEntries(history.events))

const filtered = computed(() => {
  const q = fold(query.value.trim())
  return entries.value.filter((e) => {
    if (filter.value !== 'all' && e.action !== filter.value) return false
    if (!q) return true
    const hay = [opName(e.operatorId), who(e), e.actor ?? '', placeText(e.from), placeText(e.to)].join(' ')
    return fold(hay).includes(q)
  })
})

const sections = computed(() => byDay(filtered.value, state.now))
const narrowed = computed(() => !!query.value.trim() || filter.value !== 'all')
const summary = computed(() => {
  const n = filtered.value.length
  return `${n}${history.hasMore ? '+' : ''} change${n === 1 ? '' : 's'}`
})

// Looking at the list counts as having seen it.
watch(
  () => history.events[0]?.id,
  () => markHistorySeen(),
)

// ---------------------------------------------------------------- detail

/** The sticky's whole trail (every event, not folded), newest first. */
const trail = computed<HistoryEvent[]>(() =>
  detail.value ? history.events.filter((e) => e.assignment_id === detail.value!.assignmentId) : [],
)
const onBoard = computed(() => {
  const a = detail.value ? state.assignments[detail.value.assignmentId] : undefined
  return !!a && visibleScheduleIds.value.has(a.schedule_id) && operatorsById.value.has(a.operator_id)
})
const eventWho = (e: HistoryEvent) => who({ actor: e.actor, clientId: e.client_id })

async function openDetail(e: HistoryEntry, ev: Event) {
  detailOpener = ev.currentTarget as HTMLElement
  detail.value = e
  await nextTick()
  backBtn.value?.focus({ preventScroll: true })
}
async function closeDetail() {
  detail.value = null
  await nextTick()
  if (detailOpener?.isConnected) detailOpener.focus({ preventScroll: true })
  else panel.value?.focus()
}

function onEsc() {
  if (detail.value) void closeDetail()
  else emit('close')
}

// ---------------------------------------------------------------- loading more

let io: IntersectionObserver | null = null
onMounted(() => {
  panel.value?.focus()
  markHistorySeen()
  void refreshHistory()
  if (typeof IntersectionObserver === 'function' && sentinel.value) {
    io = new IntersectionObserver((list) => list.some((x) => x.isIntersecting) && void loadMoreHistory(), {
      root: scroller.value,
      rootMargin: '0px 0px 300px 0px',
    })
    io.observe(sentinel.value)
  }
})
onBeforeUnmount(() => io?.disconnect())

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div
      ref="panel"
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hs-title"
      tabindex="-1"
      @keydown.esc.stop="onEsc"
    >
      <div class="grabber" aria-hidden="true" />

      <!-- ============ list ============ -->
      <div class="view list-view" :inert="detail ? true : undefined" :aria-hidden="detail ? 'true' : undefined">
        <nav class="nav">
          <span />
          <h2 id="hs-title">History</h2>
          <button type="button" class="done" @click="emit('close')">Done</button>
        </nav>

        <div class="controls">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2" />
              <path d="M15.5 15.5L20 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
            <input
              ref="searchInput"
              v-model="query"
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              autocapitalize="words"
              spellcheck="false"
              placeholder="Search names or duties"
              aria-label="Search history"
            />
            <button
              v-if="query"
              type="button"
              class="clear"
              aria-label="Clear search"
              @click="clearSearch"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="var(--bg-cell)" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </label>
          <div class="segmented" role="radiogroup" aria-label="Show">
            <button
              v-for="f in FILTERS"
              :key="f.id"
              type="button"
              role="radio"
              :aria-checked="filter === f.id"
              :class="{ on: filter === f.id }"
              @click="filter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <div ref="scroller" class="scroll">
          <p class="sr-only" aria-live="polite">{{ history.status === 'ready' ? summary : '' }}</p>

          <div v-if="history.status === 'loading' && !history.events.length" class="state">
            <div class="spinner" role="status" aria-label="Loading history" />
          </div>

          <div v-else-if="history.status === 'unavailable'" class="state">
            <span class="state-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 7v6M12 16.5v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
            </span>
            <h3>History Isn't Set Up</h3>
            <p>{{ history.error }}</p>
          </div>

          <div v-else-if="history.status === 'error' && !history.events.length" class="state">
            <span class="state-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.3 5.7M4 18v-5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
            <h3>Couldn't Load History</h3>
            <p>{{ history.error }}</p>
            <button type="button" class="btn" @click="refreshHistory()">Try Again</button>
          </div>

          <div v-else-if="!entries.length" class="state">
            <span class="state-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <path d="M3.2 3.8v4.6h4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <h3>No Changes Yet</h3>
            <p>When anyone adds, moves or removes a sticky, it shows up here with who did it and when.</p>
          </div>

          <div v-else-if="!filtered.length" class="state">
            <h3>No Results</h3>
            <p v-if="query.trim()">Nothing matches “{{ query.trim() }}”{{ filter !== 'all' ? ' in this filter' : '' }}.</p>
            <p v-else>No changes of this kind{{ history.hasMore ? ' yet. Older changes may still load.' : '.' }}</p>
            <button v-if="narrowed" type="button" class="btn" @click="(query = ''), (filter = 'all')">Show All Changes</button>
          </div>

          <template v-else>
            <section v-for="sec in sections" :key="sec.title">
              <h3 class="sec-title">{{ sec.title }}</h3>
              <ul class="list" role="list">
                <li v-for="e in sec.items" :key="e.id" :class="{ fresh: isFresh(e) }">
                  <button type="button" class="row" :aria-label="sentence(e)" @click="openDetail(e, $event)">
                    <span v-if="isUnseen(e)" class="unseen" aria-hidden="true" />
                    <span class="avatar" :style="{ background: opColor(e.operatorId) }" aria-hidden="true">
                      {{ initials(opName(e.operatorId)) }}
                      <span class="badge" :class="e.action">
                        <svg v-if="e.action === 'add'" viewBox="0 0 16 16"><path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
                        <svg v-else-if="e.action === 'move'" viewBox="0 0 16 16"><path d="M3.5 8h8M8.5 4.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                        <svg v-else viewBox="0 0 16 16"><path d="M4 8h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
                      </span>
                    </span>
                    <span class="row-main" aria-hidden="true">
                      <span class="row-top">
                        <span class="row-name">{{ opName(e.operatorId) }}</span>
                        <time :datetime="e.at">{{ rowTime(e.at, state.now) }}</time>
                      </span>
                      <span class="row-what">
                        <span class="verb" :class="e.action">{{ VERB[e.action] }}</span>
                        <span v-if="place(target(e))" class="place">
                          <GatheringIcon :short="place(target(e))!.g.short" :color="place(target(e))!.g.color" :size="17" />{{ place(target(e))!.label }}
                        </span>
                        <span v-else class="place gone">a removed duty</span>
                      </span>
                      <span class="row-by">
                        by <b>{{ who(e) }}</b>
                        <template v-if="e.action === 'move'">
                          · was
                          <template v-if="place(e.from)">{{ place(e.from)!.g.short }} {{ place(e.from)!.label }}</template>
                          <template v-else>a removed duty</template>
                        </template>
                        <template v-if="e.ids.length > 1"> · {{ e.ids.length }} quick changes</template>
                      </span>
                    </span>
                    <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5l6.5 6.5L9 18.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                </li>
              </ul>
            </section>
          </template>

          <div ref="sentinel" class="sentinel" />
          <div v-if="history.status === 'ready' && entries.length" class="foot">
            <div v-if="history.loadingMore" class="spinner small" role="status" aria-label="Loading earlier changes" />
            <button v-else-if="history.hasMore" type="button" class="more" @click="loadMoreHistory()">Load Earlier Changes</button>
            <p v-else>That's everything. The trail starts {{ dayTitle(history.events.at(-1)!.at, state.now).toLowerCase() === 'today' ? 'today' : `on ${new Date(history.events.at(-1)!.at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` }}.</p>
          </div>
        </div>
      </div>

      <!-- ============ detail (pushed) ============ -->
      <Transition name="push">
        <div v-if="detail" class="view detail-view" role="region" aria-label="Change details">
          <nav class="nav">
            <button ref="backBtn" type="button" class="back" @click="closeDetail">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5L7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
              History
            </button>
            <h2>Change</h2>
            <button type="button" class="done" @click="emit('close')">Done</button>
          </nav>

          <div class="scroll">
            <div class="hero">
              <span class="note" :style="{ background: opColor(detail.operatorId) }" aria-hidden="true">{{ opName(detail.operatorId) }}</span>
              <div class="hero-text">
                <p class="hero-name">{{ opName(detail.operatorId) }}</p>
                <p class="hero-sub">
                  <span class="verb" :class="detail.action">{{ PAST[detail.action][0].toUpperCase() + PAST[detail.action].slice(1) }}</span>
                  by {{ who(detail) }}
                </p>
              </div>
            </div>

            <section>
              <h3 class="sec-title">Details</h3>
              <dl class="list kv">
                <div v-if="detail.from" class="kv-row">
                  <dt>From</dt>
                  <dd>
                    <template v-if="place(detail.from)">
                      <GatheringIcon :short="place(detail.from)!.g.short" :color="place(detail.from)!.g.color" :size="20" />
                      <span><span class="kv-g">{{ place(detail.from)!.g.name }}</span>{{ place(detail.from)!.label }}</span>
                    </template>
                    <span v-else class="gone">A duty no longer on the board</span>
                  </dd>
                </div>
                <div v-if="detail.to" class="kv-row">
                  <dt>To</dt>
                  <dd>
                    <template v-if="place(detail.to)">
                      <GatheringIcon :short="place(detail.to)!.g.short" :color="place(detail.to)!.g.color" :size="20" />
                      <span><span class="kv-g">{{ place(detail.to)!.g.name }}</span>{{ place(detail.to)!.label }}</span>
                    </template>
                    <span v-else class="gone">A duty no longer on the board</span>
                  </dd>
                </div>
                <div class="kv-row">
                  <dt>By</dt>
                  <dd>
                    <span>
                      {{ detail.actor || 'Someone' }}
                      <small>{{ detail.clientId === state.clientId ? 'This device' : detail.clientId ? 'Another device' : 'Unknown device' }}</small>
                    </span>
                  </dd>
                </div>
                <div class="kv-row">
                  <dt>When</dt>
                  <dd><time :datetime="detail.at">{{ fullDateTime(detail.at) }}</time></dd>
                </div>
              </dl>
              <p v-if="detail.ids.length > 1" class="sec-foot">
                {{ detail.ids.length }} quick changes in a row are shown as one.
              </p>
            </section>

            <section v-if="onBoard">
              <div class="list">
                <button type="button" class="action-cell" @click="emit('showOnBoard', detail.assignmentId)">Show on Board</button>
              </div>
            </section>
            <p v-else class="sec-foot standalone">This sticky is no longer on the board.</p>

            <section v-if="trail.length">
              <h3 class="sec-title">This Sticky's History</h3>
              <ol class="list timeline">
                <li v-for="ev in trail" :key="ev.id" :class="{ current: detail.ids.includes(ev.id) }">
                  <span class="dot" :class="ev.action" aria-hidden="true" />
                  <span class="tl-main">
                    <span class="tl-what">
                      {{ VERB[ev.action] }} {{ placeText(ev.action === 'remove' ? ev.from_schedule_id : ev.to_schedule_id) }}
                    </span>
                    <span class="tl-by">
                      {{ eventWho(ev) }} · {{ dayTitle(ev.at, state.now) }}, {{ clockTime(ev.at) }}
                    </span>
                  </span>
                </li>
              </ol>
              <p v-if="history.hasMore" class="sec-foot">Older changes load as you scroll the history.</p>
            </section>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* ---------- mobile (base): iOS page sheet, large detent ---------- */
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
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 12px 12px 0 0;
  background: var(--bg-grouped);
  outline: none;
  animation: up 0.42s var(--ease-ios);
}
.view {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-grouped);
}
.grabber {
  position: absolute;
  z-index: 2;
  top: 5px;
  left: 50%;
  width: 36px;
  height: 5px;
  margin-left: -18px;
  border-radius: 3px;
  background: var(--label-3);
}
.nav {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 56px;
  padding: 6px 8px 0;
}
.nav h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.done,
.back {
  min-width: 44px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 17px;
}
.done {
  justify-self: end;
  font-weight: 600;
}
.back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-left: 2px;
}
.back svg {
  width: 22px;
  height: 22px;
}
.done:active,
.back:active {
  opacity: 0.4;
}

/* search field + segmented control (iOS) */
.controls {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 16px 10px;
  box-shadow: 0 0.5px 0 var(--separator);
}
.search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 6px 0 8px;
  border-radius: 10px;
  background: var(--fill);
  color: var(--label-2);
}
.search > svg {
  flex: 0 0 auto;
  width: 17px;
  height: 17px;
}
.search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: none;
  color: var(--label);
  font: inherit;
  font-size: 17px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.search input::placeholder {
  color: var(--label-2);
}
.search input::-webkit-search-cancel-button {
  display: none;
}
.search:focus-within {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tint) 40%, transparent);
}
.clear {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--label-3);
}
.clear svg {
  width: 17px;
  height: 17px;
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
  padding: 0 4px;
  border: 0;
  border-radius: 7px;
  background: none;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.2s, box-shadow 0.2s;
}
.segmented button.on {
  background: var(--seg-on);
  font-weight: 600;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12), 0 3px 1px rgba(0, 0, 0, 0.04);
}
.segmented button:focus-visible,
.row:focus-visible,
.more:focus-visible,
.action-cell:focus-visible,
.done:focus-visible,
.back:focus-visible,
.clear:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--tint) 55%, transparent);
  outline-offset: -3px;
}

.scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 16px calc(24px + var(--safe-b));
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
section {
  margin-bottom: 22px;
}
.sec-title {
  margin: 0;
  padding: 10px 16px 7px;
  color: var(--label-2);
  font-size: 13px;
  font-weight: 400;
  text-transform: uppercase;
}
.sec-foot {
  margin: 7px 16px 0;
  color: var(--label-2);
  font-size: 13px;
}
.sec-foot.standalone {
  margin: -8px 16px 22px;
}
.list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-cell);
  list-style: none;
}

/* rows: avatar · name / what / who · time · chevron (like Mail / Activity lists) */
.list > li {
  position: relative;
}
.list > li + li::before {
  content: '';
  position: absolute;
  z-index: 1;
  top: 0;
  left: 70px;
  right: 0;
  height: 0.5px;
  background: var(--separator);
}
.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 72px;
  padding: 10px 10px 10px 16px;
  border: 0;
  background: none;
  color: var(--label);
  text-align: left;
}
.row:active {
  background: var(--fill-2);
}
.fresh .row {
  animation: fresh 1.6s ease-out;
}
.unseen {
  position: absolute;
  top: 50%;
  left: 4px;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--ios-blue);
}
.avatar {
  position: relative;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  color: var(--sticky-ink);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
}
.badge {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--bg-cell);
  color: #fff;
}
.badge svg {
  width: 12px;
  height: 12px;
}
.badge.add {
  background: #248a3d; /* iOS green, darkened: white glyph ≥ 4.5:1 */
}
.badge.move {
  background: var(--tint-fill);
}
.badge.remove {
  background: var(--danger-fill, #d70015);
}
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
time {
  flex: 0 0 auto;
  color: var(--label-2);
  font-size: 15px;
}
/* Wraps rather than truncates: the duty's time is the part people look for. */
.row-what {
  min-width: 0;
  font-size: 15px;
  line-height: 1.3;
}
.row-what :deep(.g-icon) {
  margin: 0 5px 0 1px;
  vertical-align: -3px;
}
.verb + .place {
  margin-left: 4px;
}
.row-what .place {
  white-space: nowrap;
}
.verb {
  font-weight: 600;
}
.verb.add {
  color: #1e7b34;
}
.verb.move {
  color: var(--tint);
}
.verb.remove {
  color: var(--danger);
}
.row-by {
  overflow: hidden;
  color: var(--label-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-by b {
  color: var(--label);
  font-weight: 600;
}
.gone {
  color: var(--label-2);
  font-style: italic;
}
.chev {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--label-3);
}

/* empty / loading / error states (iOS ContentUnavailableView) */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 56px 24px;
  text-align: center;
}
.state-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 4px;
  color: var(--label-3);
}
.state-icon svg {
  width: 56px;
  height: 56px;
}
.state h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.state p {
  max-width: 320px;
  margin: 0 0 8px;
  color: var(--label-2);
  font-size: 15px;
}
.state .btn {
  min-height: 44px;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--fill-2);
  border-top-color: var(--label-2);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner.small {
  width: 20px;
  height: 20px;
  border-width: 2.5px;
}
.sentinel {
  height: 1px;
}
.foot {
  display: flex;
  justify-content: center;
  padding: 4px 16px 8px;
  color: var(--label-2);
  font-size: 13px;
  text-align: center;
}
.foot p {
  margin: 0;
}
.more {
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 15px;
}

/* ---------- detail ---------- */
.detail-view {
  z-index: 1;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
}
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 4px 0 8px;
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
.kv {
  margin: 0;
}
.kv-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 10px 16px;
}
.kv-row + .kv-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 0;
  height: 0.5px;
  background: var(--separator);
}
dt {
  flex: 0 0 56px;
  color: var(--label-2);
  font-size: 15px;
}
dd {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  font-size: 15px;
}
dd small {
  display: block;
  color: var(--label-2);
  font-size: 13px;
}
.kv-g {
  display: block;
  color: var(--label-2);
  font-size: 13px;
}
dd time {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--label);
}
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 17px;
}
.action-cell:active {
  background: var(--fill-2);
}
.timeline li {
  display: flex;
  gap: 12px;
  padding: 11px 16px;
}
.timeline li + li::before {
  left: 40px;
}
.timeline .current {
  background: color-mix(in srgb, var(--tint) 9%, transparent);
}
.dot {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  margin: 4px 0 0;
  border-radius: 50%;
  background: var(--tint-fill);
}
.dot.add {
  background: #248a3d;
}
.dot.remove {
  background: var(--danger-fill, #d70015);
}
.tl-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tl-what {
  font-size: 15px;
}
.tl-by {
  color: var(--label-2);
  font-size: 13px;
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

/* iOS push / pop */
.push-enter-active,
.push-leave-active {
  transition: transform 0.38s var(--ease-ios);
}
.push-enter-from,
.push-leave-to {
  transform: translateX(100%);
}

@keyframes fade {
  from { background: transparent; }
}
@keyframes up {
  from { transform: translateY(100%); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes fresh {
  from { background: color-mix(in srgb, var(--tint) 18%, transparent); }
}

/* Dark mode: the darker green text only works on light cells. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .verb.add {
    color: var(--ios-green);
  }
}
:root[data-theme='dark'] .verb.add {
  color: var(--ios-green);
}

/* ---------- compact height (phone held sideways): readable width, centred ---------- */
@media (max-height: 539.98px) {
  .overlay {
    padding: calc(var(--safe-t) + 8px) max(var(--safe-l), var(--safe-r)) 0;
  }
  .sheet {
    width: min(640px, 100%);
  }
  .nav {
    height: 46px;
    padding-top: 2px;
  }
  .controls {
    flex-direction: row;
    align-items: center;
  }
  .search {
    flex: 1 1 50%;
    height: 32px;
  }
  .segmented {
    flex: 1 1 50%;
  }
  .row {
    min-height: 64px;
    padding-block: 8px;
  }
}

/* ---------- desktop / iPad: centred form sheet ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .overlay {
    align-items: center;
    padding: 24px;
  }
  .sheet {
    width: min(560px, 100%);
    height: min(780px, 90vh);
    border-radius: 14px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
    animation: pop 0.3s var(--ease-ios);
  }
  .grabber {
    display: none;
  }
  .row:hover,
  .action-cell:hover {
    background: var(--fill);
  }
  .more:hover {
    text-decoration: underline;
  }
  @keyframes pop {
    from { transform: scale(0.94); opacity: 0; }
  }
}
</style>
