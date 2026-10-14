import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { AppHeader } from '@/components/app-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getCalendar } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { formatMinor } from '@/lib/money'

export const Route = createFileRoute('/calendar')({
  validateSearch: (search: Record<string, unknown>) => {
    const month =
      typeof search.month === 'string' && /^\d{4}-\d{2}$/.test(search.month)
        ? search.month
        : undefined
    return month ? { month } : {}
  },
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ deps }) => {
    return { calendar: await getCalendar({ data: { month: deps.month } }) }
  },
  component: Calendar,
})

function monthString(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function Calendar() {
  const { calendar } = Route.useLoaderData()
  const { year, month, weekStart, locale, currency } = calendar

  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const weekStartIndex = weekStart === 'sunday' ? 0 : 1
  const weekdayLabels =
    weekStart === 'sunday'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const offset = (firstDay.getUTCDay() - weekStartIndex + 7) % 7
  const cells: Array<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  const entriesByDay = new Map<number, typeof calendar.entries>()
  for (const entry of calendar.entries) {
    const day = entry.date.getUTCDate()
    const list = entriesByDay.get(day) ?? []
    list.push(entry)
    entriesByDay.set(day, list)
  }

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(firstDay)

  const previous =
    month === 1 ? monthString(year - 1, 12) : monthString(year, month - 1)
  const next =
    month === 12 ? monthString(year + 1, 1) : monthString(year, month + 1)

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{monthLabel}</CardTitle>
                <CardDescription>
                  {formatMinor(calendar.totalMinor, currency, locale)} due this
                  month
                  {calendar.unconvertibleCurrencies.length > 0
                    ? ` · no rates for ${calendar.unconvertibleCurrencies.join(', ')}`
                    : ''}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/calendar"
                  search={{ month: previous }}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Prev
                </Link>
                <Link
                  to="/calendar"
                  search={{}}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Today
                </Link>
                <Link
                  to="/calendar"
                  search={{ month: next }}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Next
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  className="bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {label}
                </div>
              ))}
              {cells.map((day, index) => (
                <div
                  key={index}
                  className="min-h-24 bg-background p-1.5 align-top"
                >
                  {day ? (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {day}
                      </span>
                      <div className="mt-1 flex flex-col gap-1">
                        {(entriesByDay.get(day) ?? []).map((entry) => (
                          <div
                            key={`${entry.subscriptionId}-${entry.date.getTime()}`}
                            className={`rounded bg-muted px-1.5 py-1 text-[11px] leading-tight ${
                              entry.overdue ? 'text-destructive' : ''
                            }`}
                          >
                            <span className="block truncate font-medium">
                              {entry.name}
                            </span>
                            <span className="block text-muted-foreground">
                              {formatMinor(entry.price, entry.currency, locale)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
