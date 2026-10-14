import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/lib/db'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          db.$client.prepare('SELECT 1').get()
          return Response.json({ status: 'ok' })
        } catch {
          return Response.json({ status: 'error' }, { status: 500 })
        }
      },
    },
  },
})
