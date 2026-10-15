import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
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
import {
  createMyApiKey,
  disableIcal,
  enableIcal,
  getIcalStatus,
  listMyApiKeys,
  revokeMyApiKey,
  rotateIcal,
} from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'

export const Route = createFileRoute('/_app/integrations')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const [ical, keys] = await Promise.all([getIcalStatus(), listMyApiKeys()])
    return { ical, keys }
  },
  component: Integrations,
})

function Integrations() {
  const { ical, keys } = Route.useLoaderData()
  const router = useRouter()
  const [origin, setOrigin] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'feed' | 'key' | null>(null)
  const [keyName, setKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const feedUrl = ical.path ? `${origin}${ical.path}` : null

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong.',
      )
    } finally {
      setPending(false)
    }
  }

  async function copy(value: string, flag: 'feed' | 'key') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(flag)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // clipboard unavailable: the value is visible for manual copying
    }
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <p className="text-sm text-muted-foreground">
          The feed URL and every API key are bearer credentials — anyone who has
          one can read everything in your account. Rotate or revoke them the
          moment that feels wrong.
        </p>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Calendar feed</CardTitle>
            <CardDescription>
              Subscribe in Google Calendar, Apple Calendar or anything that
              speaks iCal. Twelve months of payments, with alarms from your
              reminder settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {feedUrl ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Input readOnly value={feedUrl} className="max-w-md" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(feedUrl, 'feed')}
                  >
                    {copied === 'feed' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => rotateIcal())}
                  >
                    Rotate URL
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => disableIcal())}
                  >
                    Disable feed
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Rotating invalidates the old URL immediately; calendars will
                  need the new one.
                </p>
              </>
            ) : (
              <div>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => enableIcal())}
                >
                  Enable feed
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Full access for scripts and dashboards: send{' '}
              <code>x-api-key</code> instead of a session cookie. Limited to 600
              requests per hour per key.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field className="max-w-xs">
                <FieldLabel htmlFor="key-name">New key name</FieldLabel>
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
                  placeholder="CLI, dashboard, …"
                />
              </Field>
              <Button
                size="sm"
                disabled={pending || !keyName.trim()}
                onClick={() =>
                  run(async () => {
                    const created = await createMyApiKey({
                      data: { name: keyName.trim() },
                    })
                    setCreatedKey(created.key)
                    setKeyName('')
                  })
                }
              >
                Create key
              </Button>
            </div>

            {createdKey ? (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium">
                  This key is shown once — store it somewhere safe.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="max-w-full break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                    {createdKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(createdKey, 'key')}
                  >
                    {copied === 'key' ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreatedKey(null)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : null}

            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No keys yet — create one when a script needs access.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {keys.map((key) => (
                  <li
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {key.name ?? 'Unnamed key'}{' '}
                        {key.enabled ? null : (
                          <Badge variant="outline">disabled</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {key.start ? `${key.start}… · ` : ''}
                        created {new Date(key.createdAt).toLocaleDateString()} ·
                        last used{' '}
                        {key.lastRequest
                          ? new Date(key.lastRequest).toLocaleDateString()
                          : 'never'}
                      </p>
                    </div>
                    {confirmRevoke === key.id ? (
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              await revokeMyApiKey({ data: { keyId: key.id } })
                              setConfirmRevoke(null)
                            })
                          }
                        >
                          Confirm revoke
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmRevoke(null)}
                        >
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmRevoke(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
