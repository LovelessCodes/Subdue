import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/.well-known/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { auth } = await import('@/lib/auth')
        return auth.handler(request)
      },
    },
  },
})
