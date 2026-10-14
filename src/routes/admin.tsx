import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  getSetupStatus,
  listSocialProviders,
  removeSocialProvider,
  saveSocialProvider,
} from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import {
  socialProviderLabels,
  socialProviderNames,
} from '@/lib/social-providers'
import type { SocialProviderView } from '@/server/services/social-auth'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const status = await getSetupStatus()
    if (!status.isAdmin) {
      return { status, social: null }
    }
    return { status, social: await listSocialProviders() }
  },
  component: AdminPage,
})

function AdminPage() {
  const { status, social } = Route.useLoaderData()
  const router = useRouter()
  const [origin, setOrigin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<
    Record<string, { clientId: string; clientSecret: string }>
  >({})

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  if (!status.isAdmin || !social) {
    return (
      <div className="min-h-svh">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Administrators only</CardTitle>
              <CardDescription>
                {status.hasAdmin
                  ? 'This instance already has an administrator.'
                  : 'No administrator has claimed this instance yet.'}
              </CardDescription>
            </CardHeader>
            {!status.hasAdmin ? (
              <CardContent>
                <Button
                  size="sm"
                  onClick={() => router.navigate({ to: '/setup' })}
                >
                  Go claim it
                </Button>
              </CardContent>
            ) : null}
          </Card>
        </main>
      </div>
    )
  }

  const configured = new Map(
    social.items.map((item) => [item.provider, item] as const),
  )

  function draftFor(provider: string, item?: SocialProviderView) {
    return (
      drafts[provider] ?? {
        clientId: item?.clientId ?? '',
        clientSecret: '',
      }
    )
  }

  function setDraft(
    provider: string,
    patch: Partial<{ clientId: string; clientSecret: string }>,
  ) {
    setDrafts((current) => ({
      ...current,
      [provider]: {
        ...(current[provider] ?? { clientId: '', clientSecret: '' }),
        ...patch,
      },
    }))
  }

  async function run(provider: string, action: () => Promise<unknown>) {
    setPending(provider)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Save failed.'
      setError(
        message.includes('SOCIAL_SECRET_REQUIRED')
          ? 'A client ID and secret are both needed before a provider can be enabled.'
          : message,
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Social sign-in</CardTitle>
            <CardDescription>
              Paste the client credentials from each provider's developer
              console. The callback URL to register there is shown per provider.
              Changes apply after restarting Subdue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <ul className="flex flex-col divide-y">
              {socialProviderNames.map((provider) => {
                const item = configured.get(provider)
                const draft = draftFor(provider, item)
                const active = social.active.includes(provider)
                const callbackUrl = origin
                  ? `${origin}/api/auth/callback/${provider}`
                  : `/api/auth/callback/${provider}`

                return (
                  <li key={provider} className="flex flex-col gap-3 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {socialProviderLabels[provider]}
                      </p>
                      {active ? (
                        <Badge variant="secondary">active</Badge>
                      ) : item ? (
                        <Badge variant="outline">restart to apply</Badge>
                      ) : (
                        <Badge variant="outline">not configured</Badge>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`client-id-${provider}`}>
                          Client ID
                        </FieldLabel>
                        <Input
                          id={`client-id-${provider}`}
                          value={draft.clientId}
                          onChange={(event) =>
                            setDraft(provider, { clientId: event.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`client-secret-${provider}`}>
                          Client secret
                        </FieldLabel>
                        <Input
                          id={`client-secret-${provider}`}
                          type="password"
                          value={draft.clientSecret}
                          onChange={(event) =>
                            setDraft(provider, {
                              clientSecret: event.target.value,
                            })
                          }
                          placeholder={
                            item?.clientSecretSet
                              ? 'Set — type to replace'
                              : 'Paste the secret'
                          }
                        />
                      </Field>
                    </div>

                    <FieldDescription>
                      Callback URL: <code>{callbackUrl}</code>
                    </FieldDescription>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={
                          pending === provider || !draft.clientId.trim()
                        }
                        onClick={() =>
                          run(provider, async () => {
                            await saveSocialProvider({
                              data: {
                                provider,
                                clientId: draft.clientId.trim(),
                                clientSecret: draft.clientSecret.trim()
                                  ? draft.clientSecret.trim()
                                  : undefined,
                                enabled: true,
                              },
                            })
                            setDraft(provider, { clientSecret: '' })
                          })
                        }
                      >
                        Save
                      </Button>
                      {item ? (
                        confirmRemove === provider ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={pending === provider}
                              onClick={() =>
                                run(provider, async () => {
                                  await removeSocialProvider({
                                    data: { provider },
                                  })
                                  setConfirmRemove(null)
                                })
                              }
                            >
                              Confirm remove
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmRemove(null)}
                            >
                              Keep
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmRemove(provider)}
                          >
                            Remove
                          </Button>
                        )
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
