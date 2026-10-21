import { useMemo } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { CalendarAgenda } from '@/components/calendar-agenda'
import { CalendarWall } from '@/components/calendar-wall'
import { buildEventIndex, buildMonth } from '@/lib/calendar-view'
import { getCalendar } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'

export const Route = createFileRoute('/_app/calendar')({
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
    const calendar = await getCalendar({ data: { month: deps.month } })
    const previous =
      calendar.month === 1
        ? monthString(calendar.year - 1, 12)
        : monthString(calendar.year, calendar.month - 1)
    const next =
      calendar.month === 12
        ? monthString(calendar.year + 1, 1)
        : monthString(calendar.year, calendar.month + 1)

    const [previousMonth, nextMonth] = await Promise.all([
      getCalendar({ data: { month: previous } }),
      getCalendar({ data: { month: next } }),
    ])

    return { calendar, previousMonth, nextMonth }
  },
  component: Calendar,
})

function monthString(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function Calendar() {
  const { calendar, previousMonth, nextMonth } = Route.useLoaderData()
  const navigate = useNavigate()

  const index = useMemo(
    () => buildEventIndex([previousMonth, calendar, nextMonth]),
    [previousMonth, calendar, nextMonth],
  )
  const model = useMemo(() => buildMonth(calendar, index), [calendar, index])

  const previous = monthString(previousMonth.year, previousMonth.month)
  const next = monthString(nextMonth.year, nextMonth.month)

  function go(month?: string) {
    navigate({ to: '/calendar', search: month ? { month } : {} })
  }

  const props = {
    calendar,
    model,
    onPrev: () => go(previous),
    onNext: () => go(next),
    onToday: () => go(),
    canPrev: true,
    canNext: true,
  }

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col px-6 py-8">
        <div className="hidden lg:block">
          <CalendarWall key={`${calendar.year}-${calendar.month}`} {...props} />
        </div>
        <div className="lg:hidden">
          <CalendarAgenda {...props} />
        </div>
      </main>
    </div>
  )
}
