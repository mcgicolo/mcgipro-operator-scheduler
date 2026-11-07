import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/mcgipro-operator-scheduler/',
  plugins: [vue()],
  server: { host: true },
})
