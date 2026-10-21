import { createFileRoute, redirect } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useTranslations } from 'use-intl'
import { DashboardSummary } from '@/components/dashboard-summary'
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

export const Route = createFileRoute('/_app/')({
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

function Dashboard() {
  const { summary, budget } = Route.useLoaderData()
  const t = useTranslations('dashboard')

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col gap-6 px-6 py-8">
        <DashboardSummary summary={summary} budget={budget} />

        <Card>
          <CardHeader>
            <CardTitle>{t('upcomingPayments')}</CardTitle>
            <CardDescription>
              {t('upcomingDescription', {
                date: formatDate(summary.horizon, summary.locale),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('nothingDue', {
                  date: formatDate(summary.horizon, summary.locale),
                })}
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
                            subscription.viewerShareMinor,
                            subscription.currency,
                            summary.locale,
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {subscription.cancelledAt ? (
                        <Badge variant="outline">
                          {t('endsOn', {
                            date: formatDate(
                              subscription.cancelledAt,
                              summary.locale,
                            ),
                          })}
                        </Badge>
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
