import { convertMinorUnits } from '../../lib/money'
import { crossRate, ensureRates, ratesMap, type Fetcher } from './currencies'
import { arrivalsBetween, listIncomeSources } from './income-sources'
import { occurrencesBetween, type CycleUnit } from './recurrence'
import { getSettings } from './settings'
import { listSubscriptions } from './subscriptions'

export type CalendarEntry = {
  subscriptionId: string
  name: string
  price: number
  currency: string
  date: Date
}

export type CalendarIncomeEntry = {
  sourceId: string
  name: string
  amountMinor: number
  currency: string
  date: Date
}

export type CalendarMonth = {
  year: number
  month: number
  weekStart: string
  currency: string
  locale: string
  totalMinor: number
  arrivingMinor: number
  unconvertibleCurrencies: string[]
  entries: CalendarEntry[]
  income: CalendarIncomeEntry[]
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

  const page = await listSubscriptions(
    db,
    userId,
    { limit: 100, offset: 0, sort: 'next-payment', order: 'asc' },
    now,
  )
  const sources = await listIncomeSources(db, userId)

  const entries: CalendarEntry[] = []

  for (const subscription of page.items) {
    const cycle = {
      count: subscription.cycleCount,
      unit: subscription.cycleUnit as CycleUnit,
    }

    // nextPayment is the next occurrence, not the first one: reach back to
    // the month start so charges already taken this month still count.
    for (const date of occurrencesBetween(
      subscription.nextPayment,
      cycle,
      monthStart,
      monthEnd,
      monthStart,
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
        price: subscription.viewerShareMinor,
        currency: subscription.currency,
        date,
      })
    }
  }

  entries.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name),
  )

  const income: CalendarIncomeEntry[] = arrivalsBetween(
    sources,
    monthStart,
    monthEnd,
  )
    .map((arrival) => ({
      sourceId: arrival.source.id,
      name: arrival.source.name,
      amountMinor: arrival.source.amountMinor,
      currency: arrival.source.currency,
      date: arrival.date,
    }))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name),
    )

  const { rows: rateRows } = await ensureRates(db, {
    now,
    fetchFn: options.fetchFn,
  })
  const rates = ratesMap(rateRows)

  let totalMinor = 0
  let arrivingMinor = 0
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

  for (const arrival of income) {
    const rate = crossRate(arrival.currency, settings.currency, rates)
    if (rate === null) {
      unconvertible.add(arrival.currency)
      continue
    }
    arrivingMinor += convertMinorUnits(
      arrival.amountMinor,
      rate,
      arrival.currency,
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
    arrivingMinor,
    unconvertibleCurrencies: [...unconvertible].sort(),
    entries,
    income,
  }
}
