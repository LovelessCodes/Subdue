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
import { getBudget, getDashboard } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { formatDate, formatMinor } from '@/lib/money'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const [summary, budget] = await Promise.all([getDashboard(), getBudget()])
    return { summary, budget }
  },
  component: Dashboard,
})

function periodLabel(
  period: { start: string | Date; end: string | Date; anchored: boolean },
  locale: string,
): string {
  const start = new Date(period.start)
  const end = new Date(period.end)

  if (!period.anchored) {
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(start)
  }

  const short = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return `${short.format(start)} – ${short.format(end)}`
}

function Dashboard() {
  const { summary, budget } = Route.useLoaderData()
  const money = (amountMinor: number) =>
    formatMinor(amountMinor, summary.currency, summary.locale)

  const percent =
    budget.budgetMinor !== null && budget.budgetMinor > 0
      ? Math.min(100, Math.round((budget.dueMinor / budget.budgetMinor) * 100))
      : 100

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Monthly cost</CardDescription>
              <CardTitle className="text-2xl">
                {money(summary.monthlyTotalMinor)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {summary.change
                  ? `${summary.change.amountMinor >= 0 ? '+' : ''}${money(summary.change.amountMinor)} since ${summary.change.since}`
                  : 'First month tracked'}
                {summary.unconvertibleCurrencies.length > 0
                  ? ` · no rates for ${summary.unconvertibleCurrencies.join(', ')}`
                  : ''}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Upcoming (30 days)</CardDescription>
              <CardTitle className="text-2xl">
                {summary.upcoming.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {summary.subscriptionCount} subscriptions tracked
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Overdue</CardDescription>
              <CardTitle
                className={`text-2xl ${summary.overdueCount > 0 ? 'text-destructive' : ''}`}
              >
                {summary.overdueCount}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Due dates that have passed
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardDescription>
              {periodLabel(budget.period, budget.locale)}
            </CardDescription>
            <CardTitle className="text-2xl">
              {formatMinor(budget.dueMinor, budget.currency, budget.locale)} due
            </CardTitle>
          </CardHeader>
          <CardContent>
            {budget.budgetMinor === null ? (
              <p className="text-xs text-muted-foreground">
                No budget set for this period — configure one through the
                settings API to track headroom.
              </p>
            ) : (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      budget.overBudget ? 'bg-destructive' : 'bg-primary'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  of{' '}
                  {formatMinor(
                    budget.budgetMinor,
                    budget.currency,
                    budget.locale,
                  )}{' '}
                  budget ·{' '}
                  {budget.overBudget
                    ? `over by ${formatMinor(
                        -(budget.remainingMinor ?? 0),
                        budget.currency,
                        budget.locale,
                      )}`
                    : `${formatMinor(
                        budget.remainingMinor ?? 0,
                        budget.currency,
                        budget.locale,
                      )} left`}
                  {budget.unconvertibleCurrencies.length > 0
                    ? ` · no rates for ${budget.unconvertibleCurrencies.join(', ')}`
                    : ''}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming payments</CardTitle>
            <CardDescription>
              Rolled forward from their cycles — overdue entries are flagged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing due in the next 30 days.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {summary.upcoming.map((subscription) => (
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
                          {formatDate(subscription.nextDue, summary.locale)} ·{' '}
                          {formatMinor(
                            subscription.price,
                            subscription.currency,
                            summary.locale,
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {subscription.cancelledAt ? (
                        <Badge variant="outline">
                          ends{' '}
                          {formatDate(subscription.cancelledAt, summary.locale)}
                        </Badge>
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
