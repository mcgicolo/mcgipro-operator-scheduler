// Light / dark theme. Follows the system until the user flips the switch;
// the choice is remembered on this device. index.html applies the saved theme
// before first paint so there's no flash.
import { ref } from 'vue'

export type Theme = 'light' | 'dark'
const KEY = 'theme'

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export const theme = ref<Theme>(saved() ?? (media?.matches ? 'dark' : 'light'))

function apply(t: Theme) {
  const root = document.documentElement
  root.dataset.theme = t
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => (m.content = t === 'dark' ? '#000000' : '#f2f2f7'))
}

export function setTheme(t: Theme) {
  theme.value = t
  apply(t)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* storage unavailable: still applies for this visit */
  }
}

export function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

apply(theme.value)
// No explicit choice yet → keep following the system setting.
media?.addEventListener('change', (e) => {
  if (saved()) return
  theme.value = e.matches ? 'dark' : 'light'
  apply(theme.value)
})
