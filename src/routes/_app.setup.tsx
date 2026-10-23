import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { claimSetup, getSetupStatus } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'

export const Route = createFileRoute('/_app/setup')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => ({ status: await getSetupStatus() }),
  component: SetupPage,
})

function SetupPage() {
  const { status } = Route.useLoaderData()
  const { token: tokenFromUrl } = Route.useSearch()
  const router = useRouter()
  const [token, setToken] = useState(tokenFromUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function claim() {
    setPending(true)
    setError(null)
    try {
      await claimSetup({ data: { token } })
      await router.invalidate()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Claim failed.'
      setError(
        message.includes('SETUP_TOKEN_INVALID')
          ? 'That token does not match. Copy it from the server logs (docker compose logs | grep Frist).'
          : message,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Administrator</CardTitle>
            <CardDescription>
              The administrator configures instance-wide things — social
              sign-in, and whatever else needs a single owner.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {status.isAdmin ? (
              <>
                <p className="text-sm">
                  You are the administrator of this instance.
                </p>
                <p className="text-sm text-muted-foreground">
                  Manage social sign-in from the administration page. Other
                  people can register normally; only admins configure the
                  instance.
                </p>
                <div>
                  <Button
                    size="sm"
                    onClick={() => router.navigate({ to: '/admin' })}
                  >
                    Open administration
                  </Button>
                </div>
              </>
            ) : status.hasAdmin ? (
              <p className="text-sm text-muted-foreground">
                This instance already has an administrator. Nothing to claim.
              </p>
            ) : !status.hasToken ? (
              <p className="text-sm text-muted-foreground">
                No claim token found. Restart Frist — a fresh token is printed
                to the logs on every boot until it is claimed.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  First boot prints a claim token to the container logs, on
                  purpose: whoever can read the server's logs owns the server.
                  Find it with something like{' '}
                  <code>docker compose logs | grep Frist</code> — it also lives
                  in <code>data/setup-token</code> on the host.
                </p>
                <Field className="max-w-md">
                  <FieldLabel htmlFor="setup-token">Claim token</FieldLabel>
                  <Input
                    id="setup-token"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Paste the token from the logs"
                  />
                </Field>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <div>
                  <Button onClick={claim} disabled={pending || !token.trim()}>
                    {pending ? 'Claiming…' : 'Claim administrator'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
