<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { setNickname, state } from '../store/board'

const props = defineProps<{ editing?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const name = ref(props.editing ? state.nickname : '')
const touched = ref(false)
const input = ref<HTMLInputElement>()
const trimmed = computed(() => name.value.trim())
const error = computed(() => {
  if (trimmed.value.length < 2) return 'At least 2 characters'
  if (trimmed.value.length > 30) return 'At most 30 characters'
  return ''
})

onMounted(() => input.value?.focus())

function submit() {
  touched.value = true
  if (error.value) return
  setNickname(trimmed.value)
  emit('close')
}
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="gate-title" @keydown.esc="editing && emit('close')">
    <form class="card" novalidate @submit.prevent="submit">
      <nav v-if="editing" class="nav">
        <button type="button" class="nav-btn" @click="emit('close')">Cancel</button>
      </nav>
      <div class="content">
        <div class="note" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M4.5 20c1.6-3.3 4.3-5 7.5-5s5.9 1.7 7.5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
        <h1 id="gate-title">{{ editing ? 'Change Your Name' : "What's your name?" }}</h1>
        <p class="sub">Your name or nickname is shown on every sticky you move, so others know who placed it.</p>
        <label class="field">
          <span class="visually-hidden">Name or nickname</span>
          <input
            ref="input"
            v-model="name"
            type="text"
            maxlength="30"
            autocomplete="nickname"
            autocapitalize="words"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="done"
            placeholder="Name or nickname"
            :aria-invalid="touched && !!error"
            aria-describedby="gate-err"
            @blur="touched = true"
            @keydown.enter.prevent="!$event.isComposing && submit()"
          />
          <button v-if="name" type="button" class="clear" aria-label="Clear" @click="name = ''; input?.focus()">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="currentColor" />
              <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="var(--bg-cell)" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </label>
        <p id="gate-err" class="err" :class="{ bad: touched && !!error }">{{ touched && error ? error : '2–30 characters' }}</p>
      </div>
      <div class="actions">
        <button type="submit" class="btn primary" :disabled="!!error">
          {{ editing ? 'Save' : 'Continue' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* ---------- mobile (base): iOS full-screen onboarding sheet ---------- */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  background: var(--bg-grouped);
  animation: rise 0.45s var(--ease-ios);
}
.card {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: calc(var(--safe-t) + 8px) 0 calc(var(--safe-b) + 16px);
}
.nav {
  display: flex;
  height: 44px;
  padding: 0 8px;
}
.nav-btn {
  min-width: 44px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--tint);
  font-size: 17px;
}
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10vh 24px 0;
  text-align: center;
}
.note {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin-bottom: 22px;
  border-radius: 18px;
  background: var(--palette-head);
  color: #1c1c1e;
  box-shadow: 0 8px 22px rgba(245, 197, 24, 0.35);
}
.note svg {
  width: 40px;
  height: 40px;
}
h1 {
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.012em;
}
.sub {
  max-width: 340px;
  margin: 0 0 28px;
  color: var(--label-2);
  font-size: 17px;
  line-height: 1.35;
}
.field {
  position: relative;
  display: block;
  width: 100%;
  max-width: 420px;
}
input {
  width: 100%;
  height: 50px;
  padding: 0 44px 0 16px;
  border: 0;
  border-radius: 10px;
  background: var(--bg-cell);
  color: var(--label);
  font: inherit;
  font-size: 17px;
  caret-color: var(--tint);
}
input::placeholder {
  color: var(--label-3);
}
input:focus {
  outline: none;
}
.clear {
  position: absolute;
  top: 50%;
  right: 8px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-top: -16px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--label-3);
}
.clear svg {
  width: 18px;
  height: 18px;
}
.err {
  align-self: stretch;
  max-width: 420px;
  margin: 8px auto 0;
  padding: 0 16px;
  color: var(--label-2);
  font-size: 13px;
  text-align: left;
}
.err.bad {
  color: var(--danger);
}
.actions {
  display: flex;
  justify-content: center;
  padding: 16px 24px 0;
}
.actions .btn {
  width: 100%;
  max-width: 420px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@keyframes rise {
  from { transform: translateY(100%); }
}

/* ---------- compact height (phone held sideways) ----------
   With the keyboard up only ~150–200px are left, so drop the big icon, pull the
   field and the button up to the top, float Cancel beside the title (like a nav
   bar) and let the card scroll if it still doesn't fit. */
@media (max-height: 539.98px) {
  .card {
    position: relative;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-top: calc(var(--safe-t) + 8px);
  }
  .nav {
    position: absolute;
    top: calc(var(--safe-t) + 2px);
    left: max(8px, var(--safe-l));
    z-index: 1;
    padding: 0;
  }
  .content {
    flex: none;
    padding: 6px max(24px, var(--safe-l), var(--safe-r)) 0;
  }
  .note {
    display: none;
  }
  h1 {
    margin-bottom: 4px;
    font-size: 22px;
    line-height: 28px;
  }
  .sub {
    max-width: 560px;
    margin-bottom: 14px;
    font-size: 15px;
    line-height: 1.3;
  }
  input {
    height: 44px;
  }
  .err {
    margin-top: 4px;
  }
  .actions {
    padding: 10px max(24px, var(--safe-l), var(--safe-r)) 0;
  }
  .actions .btn {
    min-height: 44px;
  }
}
/* keyboard up in landscape: keep just title, field and button */
@media (max-height: 299.98px) {
  .sub {
    display: none;
  }
  h1 {
    margin-bottom: 10px;
  }
}

/* ---------- desktop: centered form sheet ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .overlay {
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(3px);
    animation: none;
  }
  .card {
    width: min(440px, 100%);
    padding: 12px 0 24px;
    border-radius: 14px;
    background: var(--bg-grouped);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
  }
  .content {
    flex: none;
    padding: 24px 28px 0;
  }
  .note {
    width: 64px;
    height: 64px;
  }
  h1 {
    font-size: 24px;
    color: var(--label);
  }
  .sub {
    font-size: 15px;
  }
  .actions {
    padding: 20px 28px 0;
  }
}
</style>
