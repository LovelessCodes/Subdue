import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getDashboard } from '@/lib/app.functions'
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
    return { summary: await getDashboard() }
  },
  component: Dashboard,
})

function Dashboard() {
  const { summary } = Route.useLoaderData()
  const money = (amountMinor: number) =>
    formatMinor(amountMinor, summary.currency, summary.locale)

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
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {subscription.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(subscription.nextDue, summary.locale)} ·{' '}
                        {formatMinor(
                          subscription.price,
                          subscription.currency,
                          summary.locale,
                        )}
                      </p>
                    </div>
                    {subscription.overdue ? (
                      <Badge variant="destructive">overdue</Badge>
                    ) : null}
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
