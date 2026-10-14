import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ExternalLink, Pencil } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { SubscriptionAvatar } from '@/components/subscription-avatar'
import { SubscriptionForm } from '@/components/subscription-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getMySettings,
  listMyCategories,
  listMyPaymentMethods,
  listMySubscriptions,
} from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { formatDate, formatMinor } from '@/lib/money'
import type { SubscriptionWithRecurrence } from '@/server/services/subscriptions'

export const Route = createFileRoute('/subscriptions')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const [items, settings, categories, paymentMethods] = await Promise.all([
      listMySubscriptions(),
      getMySettings(),
      listMyCategories(),
      listMyPaymentMethods(),
    ])
    return { items, settings, categories, paymentMethods }
  },
  component: Subscriptions,
})

function cycleLabel(count: number, unit: string): string {
  const singular = unit.replace(/s$/, '')
  return count === 1 ? `every ${singular}` : `every ${count} ${unit}`
}

function Subscriptions() {
  const { items, settings, categories, paymentMethods } = Route.useLoaderData()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SubscriptionWithRecurrence | null>(
    null,
  )

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(subscription: SubscriptionWithRecurrence) {
    setEditing(subscription)
    setOpen(true)
  }

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Subscriptions</CardTitle>
                <CardDescription>
                  {items.length} tracked
                  {settings.currency !== 'DKK'
                    ? ` · totals in ${settings.currency}`
                    : ''}
                </CardDescription>
              </div>
              <Button size="sm" onClick={openCreate}>
                Add subscription
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing here yet — add your first subscription with the button
                above, or import one (see “Moving your data” in the README).
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
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${subscription.name}`}
                        onClick={() => openEdit(subscription)}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <SubscriptionForm
        open={open}
        onOpenChange={setOpen}
        subscription={editing}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        paymentMethods={paymentMethods.map((method) => ({
          id: method.id,
          name: method.name,
        }))}
        defaultCurrency={settings.currency}
        defaultRemindDays={settings.remindDaysBefore}
      />
    </div>
  )
}
