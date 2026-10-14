import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/lib/db'
import { jsonError, requireUserId } from '@/server/http'
import { getSettings } from '@/server/services/settings'

export const Route = createFileRoute('/api/import/wallos')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await requireUserId(request)
        if (!userId) {
          return jsonError(401, 'UNAUTHORIZED')
        }

        const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
        const bytes = new Uint8Array(await request.arrayBuffer())
        if (bytes.byteLength === 0) {
          return jsonError(400, 'EMPTY_BODY')
        }

        const { parseWallosBackup, runImport } =
          await import('@/server/services/import')
        const settings = await getSettings(db, userId)

        let parsed
        try {
          parsed = parseWallosBackup(bytes, {
            defaultCurrency: settings.currency,
          })
        } catch (error) {
          return jsonError(
            400,
            error instanceof Error ? error.message : 'INVALID_WALLOS_BACKUP',
          )
        }

        const report = await runImport(db, userId, parsed, { dryRun })
        return Response.json(report)
      },
    },
  },
})
