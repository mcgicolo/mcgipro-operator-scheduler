import type { Backend } from './types'

export * from './types'

/**
 * Picks the backend from env vars: VITE_BACKEND=postgres (local dev DB via
 * `npm run dev:pg`), else Supabase when its keys are set, else the demo backend. Supabase is loaded lazily so the demo build
 * (no env vars) doesn't ship it in the initial chunk.
 */
export async function createBackend(): Promise<Backend> {
  if (import.meta.env.DEV && import.meta.env.VITE_BACKEND === 'postgres') {
    const { createPostgresBackend } = await import('./postgres')
    return createPostgresBackend()
  }
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  if (url && key) {
    const { createSupabaseBackend } = await import('./supabase')
    return createSupabaseBackend(url, key)
  }
  const { createLocalBackend } = await import('./local')
  return createLocalBackend()
}
