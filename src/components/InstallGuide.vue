<script setup lang="ts">
// "Add to Home Screen" sheet: an animated phone demo with numbered steps that advance in
// sync (tap a step to jump to it), or Chrome's one-tap install when the browser offers it.
// App mounts it with v-if while installGuide.isOpen; closing it any way but
// "I've Added It" / a completed install snoozes it.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { installGuide as guide } from '../composables/useInstallGuide'
import InstallAnimation from './InstallAnimation.vue'

const iconSrc = `${import.meta.env.BASE_URL}icons/icon-192.png`
const panel = ref<HTMLElement>()

// Focus return, like AssignSheet: remember the opener (captured during setup, before the
// board behind turns inert) and hand focus back when the sheet closes.
const opened = document.activeElement
const opener = opened instanceof HTMLElement && opened !== document.body ? opened : null
onMounted(() => panel.value?.focus())
onUnmounted(() => {
  stopCycle()
  nextTick(() => {
    const a = document.activeElement
    if (a && a !== document.body && a.isConnected) return
    if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true })
  })
})

const demoPlatform = computed(() => (guide.platform === 'android' ? 'android' : 'ios'))
const steps = computed(() =>
  demoPlatform.value === 'android'
    ? [
        { text: 'Tap the ⋮ menu' },
        { text: 'Tap “Add to Home screen” or “Install app”' },
        { text: 'Tap “Install”' },
        { text: 'Open Operators from your Home Screen' },
      ]
    : [
        { text: 'Tap the Share button', hint: 'On newer iPhones, tap ••• first, then Share.' },
        { text: 'Tap “Add to Home Screen”' },
        { text: 'Tap “Add”' },
        { text: 'Open Operators from your Home Screen' },
      ],
)

// The demo and the highlighted step advance together.
const step = ref(0)
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const stepMs = reduceMotion ? 4000 : 2400
let timer = 0
function stopCycle() {
  clearInterval(timer)
  timer = 0
}
function startCycle() {
  stopCycle()
  timer = window.setInterval(() => (step.value = (step.value + 1) % steps.value.length), stepMs)
}
function goTo(index: number) {
  step.value = index
  startCycle()
}
if (!guide.canInstallDirectly) startCycle()
</script>

<template>
  <div class="overlay" @click.self="guide.snooze()">
    <div
      ref="panel"
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
      aria-describedby="install-sub"
      tabindex="-1"
      @keydown.esc="guide.snooze()"
    >
      <div class="grabber" aria-hidden="true" />
      <button type="button" class="close" aria-label="Close" @click="guide.snooze()">
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
        </span>
      </button>

      <div class="scroll">
        <div class="head">
          <img :src="iconSrc" alt="" />
          <div>
            <h2 id="install-title">Add to Home Screen</h2>
            <p id="install-sub">Open the board in one tap next time, without looking for the link.</p>
          </div>
        </div>

        <div v-if="guide.canInstallDirectly" class="demo center">
          <InstallAnimation platform="android" :step="3" :icon-src="iconSrc" />
        </div>
        <div v-else class="demo">
          <InstallAnimation :platform="demoPlatform" :step="step" :icon-src="iconSrc" />
          <ol class="steps">
            <li v-for="(item, i) in steps" :key="item.text">
              <button type="button" :class="{ on: i === step }" :aria-current="i === step ? 'step' : undefined" @click="goTo(i)">
                <span class="num">{{ i + 1 }}</span>
                <span class="txt">
                  <span class="main">{{ item.text }}</span>
                  <small v-if="item.hint">{{ item.hint }}</small>
                </span>
              </button>
            </li>
          </ol>
        </div>

        <div class="actions">
          <button v-if="guide.canInstallDirectly" type="button" class="btn primary" @click="guide.promptInstall()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>
            Install App
          </button>
          <button v-else type="button" class="btn primary" @click="guide.markDone()">I’ve Added It</button>
          <button type="button" class="btn plain" @click="guide.snooze()">Not Now</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- mobile (base): iOS bottom sheet ---------- */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-top: calc(var(--safe-t) + 10px);
  background: rgba(0, 0, 0, 0.35);
  animation: fade 0.25s;
}
.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  max-height: 100%;
  border-radius: 14px 14px 0 0;
  background: var(--bg-grouped);
  outline: none;
  animation: up 0.42s var(--ease-ios);
}
.grabber {
  position: absolute;
  top: 5px;
  left: 50%;
  width: 36px;
  height: 5px;
  margin-left: -18px;
  border-radius: 3px;
  background: var(--label-3);
}
.close {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
}
.close > span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--fill);
}
.close svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--label-2);
  stroke-width: 2.6;
  stroke-linecap: round;
}
.close:active {
  opacity: 0.5;
}
.scroll {
  overflow-y: auto;
  padding: 26px 20px calc(16px + var(--safe-b));
  overscroll-behavior: contain;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 36px;
}
.head img {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  border-radius: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.head p {
  margin: 2px 0 0;
  color: var(--label-2);
  font-size: 15px;
  line-height: 1.3;
}
.demo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
}
.demo.center {
  justify-content: center;
}
.steps {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.steps li + li {
  margin-top: 4px;
}
.steps button {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 12px;
  background: none;
  text-align: left;
  transition: background 0.3s;
}
.steps button.on {
  background: var(--bg-cell);
}
.num {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--fill);
  color: var(--label-2);
  font-size: 13px;
  font-weight: 600;
  transition: background 0.3s, color 0.3s;
}
.on .num {
  background: var(--tint-fill);
  color: #fff;
}
.txt {
  min-width: 0;
  padding-top: 2px;
}
.main {
  display: block;
  color: var(--label-2);
  font-size: 15px;
  line-height: 1.3;
}
.on .main {
  color: var(--label);
  font-weight: 600;
}
.txt small {
  display: block;
  margin-top: 2px;
  color: var(--label-2);
  font-size: 12px;
  line-height: 1.3;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 22px;
}
.btn svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.btn.plain {
  background: none;
  font-weight: 400;
}

@keyframes fade {
  from { background: transparent; }
}
@keyframes up {
  from { transform: translateY(100%); }
}

/* ---------- compact height (phone held sideways): demo and steps beside the buttons ---------- */
@media (max-height: 539.98px) {
  .overlay {
    padding: calc(var(--safe-t) + 8px) max(var(--safe-l), var(--safe-r)) 0;
  }
  .sheet {
    width: min(600px, 100%);
  }
  .scroll {
    padding-top: 20px;
  }
  .head img {
    width: 44px;
    height: 44px;
    border-radius: 10px;
  }
  .demo {
    margin-top: 14px;
  }
  .actions {
    flex-direction: row-reverse;
    margin-top: 14px;
  }
  .actions .btn {
    flex: 1;
  }
}

/* ---------- desktop: centered form sheet ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .overlay {
    align-items: center;
    padding: 24px;
  }
  .sheet {
    width: min(480px, 100%);
    max-height: min(720px, 90vh);
    border-radius: 14px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
    animation: pop 0.3s var(--ease-ios);
  }
  .grabber {
    display: none;
  }
  .steps button:hover:not(.on) {
    background: var(--fill);
  }
  @keyframes pop {
    from { transform: scale(0.94); opacity: 0; }
  }
}
</style>
