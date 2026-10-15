import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { SocialProviderForm } from '@/components/social-provider-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getSetupStatus, listSocialProviders } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import {
  socialProviders,
  type SocialProviderDefinition,
} from '@/lib/social-providers'

export const Route = createFileRoute('/_app/admin')({
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
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SocialProviderDefinition | null>(null)

  if (!status.isAdmin || !social) {
    return (
      <div className="min-h-full">
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
  const envProviders = new Set(social.env)

  return (
    <div className="min-h-full">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Social sign-in</CardTitle>
            <CardDescription>
              Paste the client credentials from each provider's console. Changes
              from this page apply after restarting Subdue; providers configured
              through environment variables win over these rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {socialProviders.map((provider) => {
                const item = configured.get(provider.id)
                const active = social.active.includes(provider.id)
                const fromEnv = envProviders.has(provider.id)

                return (
                  <li
                    key={provider.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{provider.label}</p>
                      {fromEnv ? (
                        <Badge variant="secondary">from environment</Badge>
                      ) : null}
                      {active ? (
                        <Badge variant="secondary">active</Badge>
                      ) : item ? (
                        <Badge variant="outline">restart to apply</Badge>
                      ) : null}
                      {!fromEnv && !active && !item ? (
                        <Badge variant="outline">not configured</Badge>
                      ) : null}
                    </div>
                    {fromEnv ? (
                      <span className="text-xs text-muted-foreground">
                        Remove the environment variables to manage it here.
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(provider)
                          setOpen(true)
                        }}
                      >
                        {item ? 'Edit' : 'Configure'}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </main>

      <SocialProviderForm
        open={open}
        onOpenChange={setOpen}
        provider={editing}
        item={editing ? configured.get(editing.id) : undefined}
      />
    </div>
  )
}
