import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/lib/db'
import { fileStamp, jsonError, requireUserId } from '@/server/http'

export const Route = createFileRoute('/api/export/json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUserId(request)
        if (!userId) {
          return jsonError(401, 'UNAUTHORIZED')
        }

        const { exportBundle } = await import('@/server/services/export')
        const bundle = await exportBundle(db, userId)

        return new Response(JSON.stringify(bundle, null, 2), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': `attachment; filename="frist-export-${fileStamp()}.json"`,
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
