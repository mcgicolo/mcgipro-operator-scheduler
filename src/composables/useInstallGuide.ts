// "Add to Home Screen" guide state (module singleton, shared by App, TopBar and the sheet).
//  - Opens on its own shortly after the board is usable, but never when the app already runs
//    from the Home Screen, inside in-app browsers (Messenger, Facebook…, which can't add to the
//    Home Screen), under automation, or after "I've Added It". "Not Now" snoozes it for 3 days.
//  - Chrome's own install prompt (beforeinstallprompt) is kept for a one-tap Install button.
import { computed, reactive, ref } from 'vue'

const STORAGE_KEY = 'installGuide'
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

export type InstallPlatform = 'ios' | 'android' | 'other'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readState(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writeState(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Storage unavailable (private mode): the guide just shows again next time.
  }
}

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''

function detectPlatform(): InstallPlatform {
  // iPadOS reports itself as a Mac, so also check for touch support.
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => matchMedia(`(display-mode: ${mode})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Messenger / Facebook / Instagram / LINE / WeChat and Android WebViews can't add to the Home Screen. */
const isInAppBrowser = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|MicroMessenger|; wv\)/i.test(ua)

const platform = detectPlatform()
const isStandalone = detectStandalone()
// '' = never answered, 'done' = added to the Home Screen, digits = snoozed until that timestamp.
const state = ref(isStandalone ? 'done' : readState())
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isOpen = ref(false)

if (isStandalone) writeState('done')

function markDone() {
  state.value = 'done'
  writeState('done')
  deferredPrompt.value = null
  isOpen.value = false
}

function snooze() {
  const until = String(Date.now() + SNOOZE_MS)
  state.value = until
  writeState(until)
  isOpen.value = false
}

function open() {
  isOpen.value = true
}

if (typeof window !== 'undefined') {
  // Keep Chrome's install prompt for our Install button instead of its mini-infobar.
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  })
  addEventListener('appinstalled', markDone)
}

async function promptInstall() {
  const prompt = deferredPrompt.value
  if (!prompt) return
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  deferredPrompt.value = null
  if (outcome === 'accepted') markDone()
}

const canInstallDirectly = computed(() => !!deferredPrompt.value)
/** Phones/tablets, or anywhere the browser can install the app directly. */
const isAvailable = computed(
  () => state.value !== 'done' && !isInAppBrowser && (platform !== 'other' || canInstallDirectly.value),
)
const isSnoozed = computed(() => /^\d+$/.test(state.value) && Number(state.value) > Date.now())
const shouldAutoOpen = computed(
  () => isAvailable.value && platform !== 'other' && !isSnoozed.value && !navigator.webdriver,
)

export const installGuide = reactive({
  platform,
  isOpen,
  isAvailable,
  shouldAutoOpen,
  canInstallDirectly,
  open,
  snooze,
  markDone,
  promptInstall,
})
