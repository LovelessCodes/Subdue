import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/lib/db'
import { jsonError, requireUserId } from '@/server/http'

export const Route = createFileRoute('/api/import/csv')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await requireUserId(request)
        if (!userId) {
          return jsonError(401, 'UNAUTHORIZED')
        }

        const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
        const csv = await request.text()
        if (!csv.trim()) {
          return jsonError(400, 'EMPTY_BODY')
        }

        const { parseSubscriptionsCsv, runImport } =
          await import('@/server/services/import')

        let parsed
        try {
          parsed = parseSubscriptionsCsv(csv)
        } catch (error) {
          return jsonError(
            400,
            error instanceof Error ? error.message : 'INVALID_CSV',
          )
        }

        const report = await runImport(db, userId, parsed, { dryRun })
        return Response.json(report)
      },
    },
  },
})
