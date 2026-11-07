import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { pgDevApi } from './server/pgDevApi'

const base = '/mcgipro-operator-scheduler/'

export default defineConfig(({ mode }) => {
  // DATABASE_URL is server-side only (no VITE_ prefix) and only used by `npm run dev:pg`.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base,
    plugins: [vue(), pgDevApi(env.VITE_BACKEND === 'postgres' ? env.DATABASE_URL : undefined, base)],
    server: { host: true },
  }
})
