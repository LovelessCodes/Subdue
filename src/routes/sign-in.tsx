import { Link, createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getAuthProviders } from '@/lib/app.functions'
import { authClient } from '@/lib/auth-client'
import { socialProviderLabel } from '@/lib/social-providers'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/sign-in')({
  loader: async () => ({ providers: await getAuthProviders() }),
  component: SignIn,
})

function SignIn() {
  const { providers } = Route.useLoaderData()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function signInWith(provider: string) {
    setError(null)
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: '/',
      } as Parameters<typeof authClient.signIn.social>[0])
    } catch {
      setError('Social sign-in failed to start.')
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    try {
      const search = window.location.search.slice(1)
      const oauthQuery = search.includes('sig=') ? search : undefined

      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
        }),
      })

      const data = (await response.json()) as {
        url?: string
        message?: string
        twoFactorRedirect?: boolean
      }

      if (!response.ok) {
        setError(data.message ?? 'Sign-in failed')
        return
      }

      if (data.twoFactorRedirect) {
        window.location.assign('/two-factor')
        return
      }

      window.location.assign(data.url ?? '/')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Subdue</CardTitle>
          <CardDescription>
            Your subscriptions, their due dates, and what they cost.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length > 0 ? (
            <div className="mb-4 flex flex-col gap-2">
              {providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  onClick={() => signInWith(provider)}
                >
                  Continue with {socialProviderLabel(provider)}
                </Button>
              ))}
              <p className="text-center text-xs text-muted-foreground">or</p>
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            First time here?{' '}
            <Link
              to="/sign-up"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
