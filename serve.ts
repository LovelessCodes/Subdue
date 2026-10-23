import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

declare const Bun: {
  file: (path: string) => { exists: () => Promise<boolean> }
  serve: (options: {
    port: number
    hostname: string
    fetch: (
      request: Request,
      server: {
        requestIP: (request: Request) => { address: string } | null
      },
    ) => Response | Promise<Response>
  }) => unknown
}

type ServerEntry = { fetch: (request: Request) => Promise<Response> }

const clientDir = resolve(
  fileURLToPath(new URL('./dist/client', import.meta.url)),
)

// The TanStack Start build exports a fetch-style server entry with no side
// effects. Running the bundle directly works (Bun auto-serves the default
// export) but serves no static files, so this wrapper serves the client
// build and delegates everything else to the app.
const serverEntryUrl = new URL('./dist/server/server.js', import.meta.url).href
const { default: entry } = (await import(serverEntryUrl)) as {
  default: ServerEntry
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function serveClientFile(request: Request): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null
  }

  const pathname = decodeURIComponent(new URL(request.url).pathname)
  if (pathname.includes('..')) {
    return null
  }

  const filePath = resolve(clientDir, `.${pathname}`)
  if (!filePath.startsWith(`${clientDir}/`)) {
    return null
  }

  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return null
  }

  const headers: Record<string, string> = {}
  const type = CONTENT_TYPES[extname(filePath).toLowerCase()]
  if (type) {
    headers['content-type'] = type
  }
  headers['cache-control'] =
    pathname === '/sw.js'
      ? 'no-cache'
      : pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600'

  const body = request.method === 'HEAD' ? null : (file as unknown as BodyInit)
  return new Response(body, { headers })
}

const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === 'true'

// better-auth resolves the client IP from a single-value x-forwarded-for for
// per-IP rate limits. We set it from the socket so clients cannot spoof it,
// unless an operator's reverse proxy is trusted to do so.
function withClientIp(
  request: Request,
  server: { requestIP: (request: Request) => { address: string } | null },
): Request {
  if (trustProxyHeaders) {
    return request
  }
  const address = server.requestIP(request)?.address
  if (!address) {
    return request
  }
  const headers = new Headers(request.headers)
  headers.set('x-forwarded-for', address)
  return new Request(request, { headers })
}

const port = Number(process.env.PORT ?? 3000)

Bun.serve({
  port,
  hostname: '0.0.0.0',
  fetch: async (request, server) => {
    const forwarded = withClientIp(request, server)
    const staticResponse = await serveClientFile(forwarded)
    if (staticResponse) {
      return staticResponse
    }
    return entry.fetch(forwarded)
  },
})

console.log(`Frist listening on http://0.0.0.0:${port}`)
