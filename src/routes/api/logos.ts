import { createFileRoute } from '@tanstack/react-router'
import { jsonError, requireUserId } from '@/server/http'

export const Route = createFileRoute('/api/logos')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await requireUserId(request)
        if (!userId) {
          return jsonError(401, 'UNAUTHORIZED')
        }

        const { MAX_LOGO_BYTES, detectImageExtension, saveLogo } =
          await import('@/server/logos')

        const declaredLength = Number(
          request.headers.get('content-length') ?? '0',
        )
        if (declaredLength > MAX_LOGO_BYTES) {
          return jsonError(413, 'LOGO_TOO_LARGE')
        }

        const bytes = new Uint8Array(await request.arrayBuffer())
        if (bytes.byteLength === 0) {
          return jsonError(400, 'EMPTY_BODY')
        }
        if (bytes.byteLength > MAX_LOGO_BYTES) {
          return jsonError(413, 'LOGO_TOO_LARGE')
        }

        const extension = detectImageExtension(bytes)
        if (!extension) {
          return jsonError(415, 'LOGO_UNSUPPORTED_TYPE')
        }

        return Response.json({ logo: saveLogo(bytes, extension) })
      },
    },
  },
})
