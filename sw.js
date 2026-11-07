// Service worker: makes the board installable as a real app (Chrome on Android installs it as
// a standalone app, not a browser shortcut) and lets it open offline from the last visit.
//  - Hashed build files (assets/…) never change: cache-first.
//  - Everything else on this origin (the page, icons, schedule/operators JSON): network-first,
//    falling back to the last cached copy when offline. Online behaviour is unchanged.
//  - Other origins (Supabase API and realtime) are never touched.
const CACHE = 'board-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' })
    if (cached) return cached
    // Offline on a page never visited (e.g. a 404 path): serve the app shell.
    if (request.mode === 'navigate') {
      const shell = await cache.match(self.registration.scope)
      if (shell) return shell
    }
    throw err
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return
  event.respondWith(url.pathname.includes('/assets/') ? cacheFirst(request) : networkFirst(request))
})
