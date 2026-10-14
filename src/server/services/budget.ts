import type { Database } from '../../lib/db'
import { convertMinorUnits } from '../../lib/money'
import { crossRate, ensureRates, ratesMap, type Fetcher } from './currencies'
import { daysInMonth, occurrencesBetween, type CycleUnit } from './recurrence'
import { getSettings } from './settings'
import { listSubscriptions } from './subscriptions'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type BudgetPeriod = {
  start: Date
  end: Date
  anchored: boolean
}

export function getBudgetPeriod(
  now: Date,
  payAnchorDay: number | null,
): BudgetPeriod {
  const anchor = payAnchorDay && payAnchorDay > 1 ? payAnchorDay : null
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()

  if (anchor === null) {
    return {
      start: new Date(Date.UTC(year, month, 1)),
      end: new Date(Date.UTC(year, month + 1, 0)),
      anchored: false,
    }
  }

  const thisMonthStart = new Date(
    Date.UTC(year, month, Math.min(anchor, daysInMonth(year, month))),
  )

  let start = thisMonthStart
  if (now.getTime() < thisMonthStart.getTime()) {
    const previous = new Date(Date.UTC(year, month - 1, 1))
    const previousYear = previous.getUTCFullYear()
    const previousMonth = previous.getUTCMonth()
    start = new Date(
      Date.UTC(
        previousYear,
        previousMonth,
        Math.min(anchor, daysInMonth(previousYear, previousMonth)),
      ),
    )
  }

  const next = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  )
  const nextYear = next.getUTCFullYear()
  const nextMonth = next.getUTCMonth()
  const nextStart = new Date(
    Date.UTC(
      nextYear,
      nextMonth,
      Math.min(anchor, daysInMonth(nextYear, nextMonth)),
    ),
  )

  return {
    start,
    end: new Date(nextStart.getTime() - MS_PER_DAY),
    anchored: true,
  }
}

export type BudgetStatus = {
  currency: string
  locale: string
  period: BudgetPeriod
  budgetMinor: number | null
  dueMinor: number
  remainingMinor: number | null
  overBudget: boolean
  unconvertibleCurrencies: string[]
}

export async function getBudgetStatus(
  db: Database,
  userId: string,
  options: { now?: Date; fetchFn?: Fetcher } = {},
): Promise<BudgetStatus> {
  const now = options.now ?? new Date()
  const settings = await getSettings(db, userId)
  const period = getBudgetPeriod(now, settings.payAnchorDay)

  const page = await listSubscriptions(
    db,
    userId,
    { limit: 100, offset: 0, sort: 'next-payment', order: 'asc' },
    now,
  )

  const { rows: rateRows } = await ensureRates(db, {
    now,
    fetchFn: options.fetchFn,
  })
  const rates = ratesMap(rateRows)

  let dueMinor = 0
  const unconvertible = new Set<string>()

  for (const subscription of page.items) {
    const cycle = {
      count: subscription.cycleCount,
      unit: subscription.cycleUnit as CycleUnit,
    }

    const occurrences = occurrencesBetween(
      subscription.nextPayment,
      cycle,
      period.start,
      period.end,
    ).length

    if (occurrences === 0) {
      continue
    }

    const rate = crossRate(subscription.currency, settings.currency, rates)
    if (rate === null) {
      unconvertible.add(subscription.currency)
      continue
    }

    dueMinor +=
      occurrences *
      convertMinorUnits(
        subscription.price,
        rate,
        subscription.currency,
        settings.currency,
      )
  }

  const budgetMinor = settings.budgetAmountMinor ?? null

  return {
    currency: settings.currency,
    locale: settings.locale,
    period,
    budgetMinor,
    dueMinor,
    remainingMinor: budgetMinor === null ? null : budgetMinor - dueMinor,
    overBudget: budgetMinor !== null && dueMinor > budgetMinor,
    unconvertibleCurrencies: [...unconvertible].sort(),
  }
}
