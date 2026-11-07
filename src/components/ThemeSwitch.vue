<script setup lang="ts">
import { computed } from 'vue'
import { theme, toggleTheme } from '../composables/useTheme'

const isDark = computed(() => theme.value === 'dark')
</script>

<template>
  <button
    type="button"
    class="switch"
    :class="{ dark: isDark }"
    role="switch"
    :aria-checked="isDark"
    aria-label="Dark mode"
    :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <span class="knob" aria-hidden="true">
      <!-- sun -->
      <svg v-if="!isDark" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
      <!-- moon -->
      <svg v-else viewBox="0 0 24 24">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
/* iOS-style toggle: 51×31 track, 27px knob */
.switch {
  position: relative;
  flex: 0 0 auto;
  width: 51px;
  height: 31px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--fill-2);
  transition: background 0.25s ease;
}
/* 44pt hit area */
.switch::before {
  content: '';
  position: absolute;
  inset: -7px -2px;
}
.switch.dark {
  background: var(--ios-blue);
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: #fff;
  color: #c77700; /* amber sun: 3.5:1 on the white knob */
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15), 0 3px 1px rgba(0, 0, 0, 0.06);
  transition: transform 0.3s var(--ease-ios);
}
.dark .knob {
  transform: translateX(20px);
  color: #5e5ce6;
}
.knob svg {
  width: 16px;
  height: 16px;
}
/* Phones: the 51pt track doesn't fit an iOS nav bar beside a centered title, so
   collapse to a plain 44pt bar-button showing the current mode (sun / moon). */
@media (max-width: 767.98px), (max-height: 539.98px) {
  .switch,
  .switch.dark {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: none;
  }
  .switch::before {
    content: none;
  }
  .knob,
  .dark .knob {
    inset: 0;
    width: auto;
    height: auto;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: var(--tint);
    transform: none;
    transition: none;
  }
  .knob svg {
    width: 22px;
    height: 22px;
  }
  .switch:active {
    opacity: 0.4;
  }
}
.switch:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--tint) 55%, transparent);
  outline-offset: 2px;
}
</style>
