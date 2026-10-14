import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/lib/db'

export const Route = createFileRoute('/api/ical/$token')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const pathname = new URL(request.url).pathname
        const token = pathname.split('/').pop() ?? ''

        const { buildUserIcalFeed, findUserIdByIcalToken } =
          await import('@/server/services/ical')
        const userId = await findUserIdByIcalToken(db, token)
        if (!userId) {
          return new Response('Not found', { status: 404 })
        }

        const feed = await buildUserIcalFeed(db, userId)
        return new Response(feed, {
          headers: {
            'content-type': 'text/calendar; charset=utf-8',
            'cache-control': 'private, max-age=900',
          },
        })
      },
    },
  },
})
