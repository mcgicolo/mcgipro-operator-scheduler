import { createApp } from 'vue'
import './styles/tokens.css'
import './composables/useTheme'
import App from './App.vue'
import { init } from './store/board'

createApp(App).mount('#app')
void init()
