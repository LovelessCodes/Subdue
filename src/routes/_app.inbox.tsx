import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { SubscriptionAvatar } from '@/components/subscription-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import { getInbox, markInboxRead } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { formatDate, formatMinor } from '@/lib/money'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const SECTIONS = ['Overdue', 'This week', 'Next week', 'Later'] as const

const rise =
  'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none'

export const Route = createFileRoute('/_app/inbox')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const inbox = await getInbox()
    return { ...inbox, now: Date.now() }
  },
  component: Inbox,
})

function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      MS_PER_DAY,
  )
}

function daysUntil(dueDate: Date, now: number): number {
  return dayNumber(new Date(dueDate)) - dayNumber(new Date(now))
}

function sectionOf(days: number): (typeof SECTIONS)[number] {
  if (days < 0) return 'Overdue'
  if (days <= 7) return 'This week'
  if (days <= 14) return 'Next week'
  return 'Later'
}

function whenLabel(days: number): string {
  if (days < 0) {
    const count = -days
    return count === 1 ? '1 day overdue' : `${count} days overdue`
  }
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

function badgeVariant(days: number): 'destructive' | 'secondary' | 'outline' {
  if (days < 0) return 'destructive'
  if (days <= 3) return 'secondary'
  return 'outline'
}

function Inbox() {
  const { items, unread, summary, now } = Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() ||
      a.subscriptionName.localeCompare(b.subscriptionName),
  )
  const groups = SECTIONS.map((title) => ({
    title,
    items: sorted.filter(
      (item) => sectionOf(daysUntil(item.dueDate, now)) === title,
    ),
  })).filter((group) => group.items.length > 0)
  const nextUp =
    sorted.find((item) => daysUntil(item.dueDate, now) >= 0) ?? null

  async function markRead(id: string) {
    setPendingIds((current) => new Set(current).add(id))
    try {
      await markInboxRead({ data: { ids: [id] } })
      await router.invalidate()
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  async function markAll() {
    setPending(true)
    try {
      await markInboxRead({ data: {} })
      await router.invalidate()
    } finally {
      setPending(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-full">
        <main className="flex w-full flex-col gap-6 px-6 py-8">
          <header>
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Inbox
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              You’re all caught up.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reminders about upcoming charges land here.
            </p>
          </header>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
          <div
            className={cn(rise, 'duration-200')}
            style={{ animationDelay: '0ms' }}
          >
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Inbox
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {formatMinor(
                summary.weekTotalMinor,
                summary.currency,
                summary.locale,
              )}{' '}
              due this week
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {unread} unread of {items.length} reminders
              {nextUp
                ? ` · next up ${nextUp.subscriptionName}, ${whenLabel(daysUntil(nextUp.dueDate, now))}`
                : ''}
              {summary.unconvertibleCurrencies.length > 0
                ? ` · no rates for ${summary.unconvertibleCurrencies.join(', ')}`
                : ''}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={markAll}
            disabled={pending || unread === 0}
          >
            Mark all read
          </Button>
        </header>

        {groups.map((group, groupIndex) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h3
              className={cn(
                'text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase',
                rise,
              )}
              style={{ animationDelay: `${60 + groupIndex * 60}ms` }}
            >
              {group.title}
            </h3>
            {group.items.map((item, index) => {
              const days = daysUntil(item.dueDate, now)
              return (
                <article
                  key={item.id}
                  className={cn(
                    'group flex animate-in items-center gap-3.5 rounded-xl bg-card px-4 py-3.5 fade-in-0 fill-mode-both ring-1 ring-foreground/10 transition-colors duration-200 hover:bg-muted/20 motion-reduce:animate-none',
                  )}
                  style={{
                    animationDelay: `${Math.min(90 + groupIndex * 60 + index * 25, 400)}ms`,
                  }}
                >
                  <SubscriptionAvatar
                    name={item.subscriptionName}
                    logo={item.subscriptionLogo}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm',
                        item.readAt ? 'text-muted-foreground' : 'font-medium',
                      )}
                    >
                      {item.subscriptionName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      due {formatDate(new Date(item.dueDate), summary.locale)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'text-sm tabular-nums',
                      item.readAt ? 'text-muted-foreground' : 'font-medium',
                    )}
                  >
                    {formatMinor(
                      item.subscriptionPrice,
                      item.subscriptionCurrency,
                      summary.locale,
                    )}
                  </p>
                  <Badge
                    variant={badgeVariant(days)}
                    className="hidden sm:inline-flex"
                  >
                    {whenLabel(days)}
                  </Badge>
                  {item.readAt ? null : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Mark ${item.subscriptionName} as read`}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      disabled={pendingIds.has(item.id)}
                      onClick={() => markRead(item.id)}
                    >
                      <Check className="size-4" />
                    </Button>
                  )}
                </article>
              )
            })}
          </section>
        ))}
      </main>
    </div>
  )
}
