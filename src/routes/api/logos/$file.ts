import { readFile } from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { requireUserId } from '@/server/http'

export const Route = createFileRoute('/api/logos/$file')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUserId(request)
        if (!userId) {
          return new Response('Unauthorized', { status: 401 })
        }

        const file = decodeURIComponent(
          new URL(request.url).pathname.split('/').pop() ?? '',
        )
        const { logoContentType, logoFilePath } = await import('@/server/logos')
        const path = logoFilePath(file)
        const contentType = logoContentType(file)
        if (!path || !contentType) {
          return new Response('Not found', { status: 404 })
        }

        try {
          const bytes = await readFile(path)
          return new Response(new Uint8Array(bytes), {
            headers: {
              'content-type': contentType,
              'cache-control': 'private, max-age=3600',
            },
          })
        } catch {
          return new Response('Not found', { status: 404 })
        }
      },
    },
  },
})
