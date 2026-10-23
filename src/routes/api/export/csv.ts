import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/lib/db'
import { fileStamp, jsonError, requireUserId } from '@/server/http'

export const Route = createFileRoute('/api/export/csv')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUserId(request)
        if (!userId) {
          return jsonError(401, 'UNAUTHORIZED')
        }

        const { exportSubscriptionsCsv } =
          await import('@/server/services/export')
        const csv = await exportSubscriptionsCsv(db, userId)

        return new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="frist-subscriptions-${fileStamp()}.csv"`,
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
