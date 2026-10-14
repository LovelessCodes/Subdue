import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { verifyConsentQuery } from '@/lib/oauth.functions'

export const Route = createFileRoute('/consent')({
  beforeLoad: async () => {
    const consent = await verifyConsentQuery()
    return { consent }
  },
  component: Consent,
})

const scopeDescriptions: Record<string, string> = {
  openid: 'Confirm your identity',
  profile: 'Read your profile name',
  email: 'Read your email address',
  offline_access: 'Stay connected without signing in again',
  'mcp:read': 'Read your subscriptions and categories',
}

function Consent() {
  const { consent } = Route.useRouteContext()
  const [clientName, setClientName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!consent) {
      return
    }
    fetch(
      `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(consent.clientId)}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setClientName(data?.client_name ?? null))
      .catch(() => {})
  }, [consent])

  async function decide(accept: boolean) {
    setPending(true)
    setError(null)

    try {
      const search = window.location.search.slice(1)
      const response = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, oauth_query: search }),
      })

      const data = (await response.json()) as {
        url?: string
        message?: string
      }

      if (data.url) {
        window.location.assign(data.url)
        return
      }

      setError(data.message ?? 'Could not complete the authorization.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (!consent) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invalid request</CardTitle>
            <CardDescription>
              This authorization request is invalid or has expired. Close this
              window and try connecting again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const scopes = consent.scope.split(' ').filter(Boolean)

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Authorize {clientName ?? 'an application'}</CardTitle>
          <CardDescription>
            {clientName ?? 'An application'} wants access to your Subdue data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground">•</span>
                <span>
                  {scopeDescriptions[scope] ?? `Access ${scope}`}
                  <span className="text-muted-foreground"> ({scope})</span>
                </span>
              </li>
            ))}
          </ul>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => decide(false)}
            >
              Deny
            </Button>
            <Button
              className="flex-1"
              disabled={pending}
              onClick={() => decide(true)}
            >
              {pending ? 'Authorizing…' : 'Allow'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
