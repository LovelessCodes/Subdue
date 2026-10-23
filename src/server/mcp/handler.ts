import { requireMcpAuth } from '@better-auth/mcp'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { auth, mcpResource } from '../../lib/auth'
import { createFristMcpServer } from './server'

const mcpHandler = createMcpHandler(
  (ctx) => createFristMcpServer(ctx.authInfo),
  { legacy: 'reject' },
)

export const handleMcpPost = requireMcpAuth(
  auth,
  (request, claims) =>
    mcpHandler.fetch(request, {
      authInfo: {
        token:
          request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
          '',
        clientId: typeof claims.client_id === 'string' ? claims.client_id : '',
        scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
        extra: { userId: claims.sub },
      },
    }),
  {
    resource: mcpResource,
    requiredScopes: ['mcp:read'],
  },
)
