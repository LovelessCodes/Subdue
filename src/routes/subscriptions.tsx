import { createFileRoute, redirect } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { SubscriptionAvatar } from '@/components/subscription-avatar'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getMySettings, listMySubscriptions } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { formatDate, formatMinor } from '@/lib/money'

export const Route = createFileRoute('/subscriptions')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const [items, settings] = await Promise.all([
      listMySubscriptions(),
      getMySettings(),
    ])
    return { items, settings }
  },
  component: Subscriptions,
})

function cycleLabel(count: number, unit: string): string {
  const singular = unit.replace(/s$/, '')
  return count === 1 ? `every ${singular}` : `every ${count} ${unit}`
}

function Subscriptions() {
  const { items, settings } = Route.useLoaderData()

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>
              {items.length} tracked
              {settings.currency !== 'DKK'
                ? ` · totals in ${settings.currency}`
                : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing here yet — add subscriptions through the API or your MCP
                client, and the create form lands next.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {items.map((subscription) => (
                  <li
                    key={subscription.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SubscriptionAvatar
                        name={subscription.name}
                        logo={subscription.logo}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {subscription.name}
                          </p>
                          {subscription.url ? (
                            <a
                              href={subscription.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${subscription.name}`}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {cycleLabel(
                            subscription.cycleCount,
                            subscription.cycleUnit,
                          )}{' '}
                          · next{' '}
                          {formatDate(subscription.nextDue, settings.locale)}
                          {subscription.paymentMethodName
                            ? ` · ${subscription.paymentMethodName}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {formatMinor(
                          subscription.price,
                          subscription.currency,
                          settings.locale,
                        )}
                      </span>
                      {subscription.cancelledAt ? (
                        <Badge variant="outline">
                          cancelled{' '}
                          {formatDate(
                            subscription.cancelledAt,
                            settings.locale,
                          )}
                        </Badge>
                      ) : subscription.autoRenew === false ? (
                        <Badge variant="outline">no auto-renew</Badge>
                      ) : null}
                      {subscription.overdue ? (
                        <Badge variant="destructive">overdue</Badge>
                      ) : null}
                    </div>
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
