import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMcpPost } = await import('@/server/mcp/handler')
        return handleMcpPost(request)
      },
    },
  },
})
