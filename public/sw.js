// Frist service worker.
//
// Network-first for page navigations, cache-first for content-hashed assets.
// API and server-function responses are never cached, so whenever the server
// is reachable the data is fresh. The app shell and the assets it references
// are precached on install, so the first offline visit is styled even before
// the user has navigated a second time. Offline, a previously visited page
// renders from cache with a timestamped banner; an unvisited page gets a
// branded offline screen.
// The full reasoning lives in docs/adr/0001-offline-behaviour.md.

const CACHE = 'frist-pages-v3'
const APP_SHELL = '/'
const PRECACHE = [
  '/manifest.webmanifest',
  '/icons/icon-32.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Cache-first only for the deployed static directories. Their files are
// versioned by deploys (built assets carry content hashes), whereas dev
// keeps CSS and modules at stable URLs under /src and /@. Dev assets use
// network-first below so HMR stays fresh online and the last copy works
// offline.
const STATIC_PATTERN = /^\/(assets|brands|fonts|icons)\//
const DEV_ASSET_PATTERN = /^\/(src|@|node_modules)\//

function isStaticAssetUrl(value) {
  try {
    const url = new URL(value, self.location.origin)
    if (url.origin !== self.location.origin) {
      return false
    }
    return (
      STATIC_PATTERN.test(url.pathname) || DEV_ASSET_PATTERN.test(url.pathname)
    )
  } catch {
    return false
  }
}

async function cacheAsset(cache, value) {
  try {
    const url = new URL(value, self.location.origin)
    if (!isStaticAssetUrl(url.href)) {
      return
    }
    if (await cache.match(url.href)) {
      return
    }
    const response = await fetch(url.href, { credentials: 'same-origin' })
    if (!response.ok) {
      return
    }
    await cache.put(url.href, response.clone())
    const type = response.headers.get('content-type') ?? ''
    if (type.includes('text/css') || url.pathname.endsWith('.css')) {
      await cacheCssDependencies(cache, url.href, await response.text())
    }
  } catch {
    // A missing asset should never fail the install or a navigation.
  }
}

async function cacheCssDependencies(cache, cssUrl, css) {
  const values = new Set()
  for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const value = match[2]
    if (!value || value.startsWith('data:') || value.startsWith('#')) {
      continue
    }
    try {
      const resolved = new URL(value, cssUrl)
      if (isStaticAssetUrl(resolved.href)) {
        values.add(resolved.href)
      }
    } catch {
      // Ignore malformed URLs in a stylesheet.
    }
  }
  await Promise.allSettled([...values].map((value) => cacheAsset(cache, value)))
}

// Fetch the rendered shell and every stylesheet/script/preload it references.
// This is what makes the very first offline visit styled: the navigation cache
// alone has the HTML, but not the hashed CSS and JS.
async function precacheShell(cache) {
  let response
  try {
    response = await fetch(APP_SHELL, {
      credentials: 'same-origin',
      cache: 'reload',
    })
  } catch {
    return
  }
  if (!response.ok) {
    return
  }

  const html = await response.clone().text()
  await cache.put(APP_SHELL, response.clone())

  const values = new Set()
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1]
    if (value && isStaticAssetUrl(value)) {
      values.add(value)
    }
  }
  await Promise.allSettled([...values].map((value) => cacheAsset(cache, value)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.allSettled(
        PRECACHE.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' })
          if (response.ok) {
            await cache.put(url, response.clone())
          }
        }),
      )
      await precacheShell(cache)
      await self.skipWaiting()
    })(),
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

// Dev keeps styles and modules at stable URLs. Fetch fresh online, fall back
// to the last copy offline, so HMR is not pinned to a stale stylesheet.
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }
    throw error
  }
}

function offlineBanner(dateHeader, pathname) {
  const stamp = dateHeader
    ? new Date(dateHeader).toLocaleString()
    : 'an earlier visit'
  const retry = escapeHtml(pathname)
  return (
    '<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
    'background:#18181b;color:#fafafa;font:500 12.5px/1.5 system-ui,sans-serif;' +
    'padding:9px 16px;text-align:center;box-shadow:0 -1px 0 rgba(255,255,255,.08)">' +
    'Offline — showing a saved copy from ' +
    escapeHtml(stamp) +
    '. Data may be stale. ' +
    '<a href="' +
    retry +
    '" style="color:#fdba74;text-decoration:none;font-weight:600">Retry</a></div>'
  )
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function offlinePage(pathname) {
  const path = escapeHtml(pathname)
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#18181b">
<title>Frist — offline</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    min-height: 100vh; margin: 0; display: grid; place-items: center;
    padding: 24px; background: #fbf8f4; color: #221e1a;
    font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: min(430px, 100%); padding: 34px 30px 28px;
    background: #fff; border: 1px solid #e6ded5; border-radius: 22px;
    box-shadow: 0 1px 0 rgba(34,30,26,.03), 0 18px 50px rgba(34,30,26,.08);
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 650; letter-spacing: -.02em; }
  .mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: #18181b; }
  .eyebrow { margin: 28px 0 6px; color: #b44a1f; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 26px; line-height: 1.15; letter-spacing: -.035em; }
  p { margin: 10px 0 0; color: #6f675e; }
  .path { margin-top: 18px; padding: 9px 11px; border-radius: 8px; background: #f6f1eb; color: #514a42; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 24px; }
  .primary, .secondary {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 38px; padding: 0 15px; border-radius: 9px;
    font-size: 13px; font-weight: 600; text-decoration: none;
  }
  .primary { background: #b44a1f; color: #fff; }
  .secondary { border: 1px solid #e0d7cd; color: #3f3933; }
  .note { margin-top: 20px; font-size: 11.5px; color: #8a8177; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1815; color: #f5f0e9; }
    .card { background: #221f1c; border-color: #3a342e; box-shadow: 0 18px 50px rgba(0,0,0,.3); }
    p { color: #a89f94; }
    .path { background: #2a2622; color: #cfc6bb; }
    .primary { background: #e07a45; color: #1a1815; }
    .secondary { border-color: #3a342e; color: #e8e1d8; }
    .note { color: #8f857a; }
  }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="20" height="20">
          <circle cx="15" cy="14" r="7.5" fill="none" stroke="#f8f8f8" stroke-width="4"></circle>
          <circle cx="21" cy="20" r="3.6" fill="#f97316"></circle>
        </svg>
      </span>
      Frist
    </div>
    <p class="eyebrow">Offline</p>
    <h1>This page isn't saved yet.</h1>
    <p>Frist can't reach the server, and this page hasn't been cached on this device. Reconnect to the server and try again.</p>
    <div class="path">${path}</div>
    <div class="actions">
      <a class="primary" href="${path}">Try again</a>
      <a class="secondary" href="/">Open the last saved page</a>
    </div>
    <p class="note">Your data is safe on the server. Only the last visited pages are available offline.</p>
  </main>
</body>
</html>`
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
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
      return offlinePage(new URL(request.url).pathname)
    }
    const html = await cached.text()
    const banner = offlineBanner(
      cached.headers.get('date'),
      new URL(request.url).pathname,
    )
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
  if (STATIC_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (DEV_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(networkFirst(request))
  }
})
