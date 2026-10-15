// Subdue service worker.
//
// Network-first for page navigations, cache-first for content-hashed assets.
// API and server-function responses are never cached, so whenever the server
// is reachable the data is fresh. Offline, a previously visited page renders
// from cache with a timestamped banner; an unvisited page gets a notice.
// The full reasoning lives in docs/adr/0001-offline-behaviour.md.

const CACHE = 'subdue-pages-v2'
const PRECACHE = ['/manifest.webmanifest', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name !== CACHE)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

// Cache-first only for the deployed static directories. Their files are
// versioned by deploys (built assets carry content hashes), whereas dev
// keeps CSS and modules at stable URLs under /src and /@ — caching those
// offline-first would pin a stale stylesheet across reloads.
const STATIC_PATTERN = /^\/(assets|brands|fonts|icons)\//

function isCacheableAsset(url) {
  return STATIC_PATTERN.test(url.pathname)
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}

function offlineBanner(dateHeader) {
  const stamp = dateHeader
    ? new Date(dateHeader).toLocaleString()
    : 'an earlier visit'
  return (
    '<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
    'background:#18181b;color:#fafafa;font:500 13px/1.4 system-ui,sans-serif;' +
    'padding:8px 16px;text-align:center">Offline — showing a cached copy from ' +
    stamp +
    '. Data may be stale.</div>'
  )
}

async function navigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (!cached) {
      return new Response(
        '<!doctype html><title>Offline</title>' +
          '<body style="font:15px system-ui;padding:2rem"><h1>Offline</h1>' +
          '<p>Subdue has not cached this page yet. Reconnect and visit it once more.</p></body>',
        {
          status: 503,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      )
    }
    const html = await cached.text()
    const banner = offlineBanner(cached.headers.get('date'))
    return new Response(
      html.includes('</body>')
        ? html.replace('</body>', `${banner}</body>`)
        : html + banner,
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      },
    )
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request))
    return
  }
  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(request))
  }
})
