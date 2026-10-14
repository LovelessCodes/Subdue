import { Link, createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getAuthProviders } from '@/lib/app.functions'
import { authClient } from '@/lib/auth-client'
import {
  socialProviderLabels,
  type SocialProviderName,
} from '@/lib/social-providers'

export const Route = createFileRoute('/sign-up')({
  loader: async () => ({ providers: await getAuthProviders() }),
  component: SignUp,
})

function SignUp() {
  const { providers } = Route.useLoaderData()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function signInWith(provider: SocialProviderName) {
    setError(null)
    try {
      await authClient.signIn.social({ provider, callbackURL: '/setup' })
    } catch {
      setError('Social sign-in failed to start.')
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const result = await authClient.signUp.email({ name, email, password })

    setPending(false)
    if (result.error) {
      setError(result.error.message ?? 'Could not create the account.')
      return
    }
    window.location.assign('/setup')
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            The first account is a normal account — claim the administrator role
            from the setup page afterwards.
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
                  onClick={() => signInWith(provider as SocialProviderName)}
                >
                  Continue with{' '}
                  {socialProviderLabels[provider as SocialProviderName] ??
                    provider}
                </Button>
              ))}
              <p className="text-center text-xs text-muted-foreground">or</p>
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create account'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to="/sign-in"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
