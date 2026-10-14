import { verifyOAuthQueryParams } from '@better-auth/oauth-provider'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from './auth'

export const verifyConsentQuery = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getRequest()
    const query = new URL(request.url).search.slice(1)

    if (!query) {
      return null
    }

    const { secret } = await auth.$context
    const verified = await verifyOAuthQueryParams(query, secret)

    if (!verified) {
      return null
    }

    const params = new URLSearchParams(query)
    return {
      clientId: params.get('client_id') ?? '',
      scope: params.get('scope') ?? '',
    }
  },
)
