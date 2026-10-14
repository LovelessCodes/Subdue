import { rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/lib/db'
import { fileStamp, jsonError, requireUserId } from '@/server/http'

export const Route = createFileRoute('/api/export/backup')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUserId(request)
        if (!userId) {
          return jsonError(401, 'UNAUTHORIZED')
        }

        const { createBackup } = await import('@/server/services/export')
        const path = join(tmpdir(), `subdue-backup-${crypto.randomUUID()}.db`)

        try {
          createBackup(db, path)
          const bytes = await readFile(path)
          return new Response(new Uint8Array(bytes), {
            headers: {
              'content-type': 'application/octet-stream',
              'content-disposition': `attachment; filename="subdue-backup-${fileStamp()}.db"`,
              'cache-control': 'no-store',
            },
          })
        } finally {
          await rm(path, { force: true })
        }
      },
    },
  },
})
