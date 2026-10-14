import { convertMinorUnits } from '../../lib/money'
import { crossRate, ensureRates, ratesMap, type Fetcher } from './currencies'
import { occurrencesBetween, type CycleUnit } from './recurrence'
import { getSettings } from './settings'
import { listSubscriptions } from './subscriptions'

export type CalendarEntry = {
  subscriptionId: string
  name: string
  price: number
  currency: string
  date: Date
  overdue: boolean
}

export type CalendarMonth = {
  year: number
  month: number
  weekStart: string
  currency: string
  locale: string
  totalMinor: number
  unconvertibleCurrencies: string[]
  entries: CalendarEntry[]
}

export async function getCalendarMonth(
  db: Parameters<typeof listSubscriptions>[0],
  userId: string,
  params: { year: number; month: number },
  options: { now?: Date; fetchFn?: Fetcher } = {},
): Promise<CalendarMonth> {
  const now = options.now ?? new Date()
  const settings = await getSettings(db, userId)

  const monthStart = new Date(Date.UTC(params.year, params.month - 1, 1))
  const monthEnd = new Date(
    Date.UTC(params.year, params.month, 0, 23, 59, 59, 999),
  )
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )
  const isCurrentMonth =
    params.year === now.getUTCFullYear() &&
    params.month === now.getUTCMonth() + 1

  const page = await listSubscriptions(
    db,
    userId,
    { limit: 100, offset: 0, sort: 'next-payment', order: 'asc' },
    now,
  )

  const entries: CalendarEntry[] = []

  for (const subscription of page.items) {
    const cycle = {
      count: subscription.cycleCount,
      unit: subscription.cycleUnit as CycleUnit,
    }

    for (const date of occurrencesBetween(
      subscription.nextPayment,
      cycle,
      monthStart,
      monthEnd,
    )) {
      if (
        subscription.cancelledAt &&
        date.getTime() > subscription.cancelledAt.getTime()
      ) {
        continue
      }
      entries.push({
        subscriptionId: subscription.id,
        name: subscription.name,
        price: subscription.price,
        currency: subscription.currency,
        date,
        overdue: isCurrentMonth && date.getTime() < startOfToday,
      })
    }
  }

  entries.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name),
  )

  const { rows: rateRows } = await ensureRates(db, {
    now,
    fetchFn: options.fetchFn,
  })
  const rates = ratesMap(rateRows)

  let totalMinor = 0
  const unconvertible = new Set<string>()

  for (const entry of entries) {
    const rate = crossRate(entry.currency, settings.currency, rates)
    if (rate === null) {
      unconvertible.add(entry.currency)
      continue
    }
    totalMinor += convertMinorUnits(
      entry.price,
      rate,
      entry.currency,
      settings.currency,
    )
  }

  return {
    year: params.year,
    month: params.month,
    weekStart: settings.weekStart,
    currency: settings.currency,
    locale: settings.locale,
    totalMinor,
    unconvertibleCurrencies: [...unconvertible].sort(),
    entries,
  }
}
