import { createApp } from 'vue'
import './styles/tokens.css'
import './composables/useTheme'
import App from './App.vue'
import { init } from './store/board'

createApp(App).mount('#app')
void init()

// Service worker (production only): lets Chrome install the board as a standalone app and
// opens it offline from the last visit. Dev keeps plain network loads (no stale caches).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
