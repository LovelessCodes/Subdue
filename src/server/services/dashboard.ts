import { and, eq } from 'drizzle-orm'
import { costSnapshot } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { convertMinorUnits } from '../../lib/money'
import { crossRate, ensureRates, ratesMap, type Fetcher } from './currencies'
import type { CycleUnit } from './recurrence'
import { getSettings } from './settings'
import {
  listSubscriptions,
  type SubscriptionWithRecurrence,
} from './subscriptions'

const PAYMENTS_PER_YEAR: Record<CycleUnit, number> = {
  days: 365.25,
  weeks: 52.17857142857143,
  months: 12,
  years: 1,
}

export function monthlyEquivalentMinor(
  price: number,
  cycleUnit: CycleUnit,
  cycleCount: number,
): number {
  return Math.round((price * PAYMENTS_PER_YEAR[cycleUnit]) / cycleCount / 12)
}

export type DashboardChange = {
  amountMinor: number
  since: string
}

export type DashboardSummary = {
  currency: string
  locale: string
  monthlyTotalMinor: number
  change: DashboardChange | null
  upcoming: SubscriptionWithRecurrence[]
  overdueCount: number
  unconvertibleCurrencies: string[]
  subscriptionCount: number
}

function yearMonth(now: Date): { year: number; month: number } {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
}

export async function upsertCostSnapshot(
  db: Database,
  userId: string,
  now: Date,
  totalMinor: number,
  currency: string,
): Promise<void> {
  const { year, month } = yearMonth(now)

  await db
    .insert(costSnapshot)
    .values({
      id: crypto.randomUUID(),
      userId,
      year,
      month,
      totalMinor,
      currency,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [costSnapshot.userId, costSnapshot.year, costSnapshot.month],
      set: { totalMinor, currency },
    })
}

async function previousSnapshot(db: Database, userId: string, now: Date) {
  const { year, month } = yearMonth(now)
  const previousMonth = month === 1 ? 12 : month - 1
  const previousYear = month === 1 ? year - 1 : year

  const rows = await db
    .select()
    .from(costSnapshot)
    .where(
      and(
        eq(costSnapshot.userId, userId),
        eq(costSnapshot.year, previousYear),
        eq(costSnapshot.month, previousMonth),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}

export async function getDashboardSummary(
  db: Database,
  userId: string,
  options: { now?: Date; fetchFn?: Fetcher } = {},
): Promise<DashboardSummary> {
  const now = options.now ?? new Date()
  const settings = await getSettings(db, userId)
  const { rows: rateRows } = await ensureRates(db, {
    now,
    fetchFn: options.fetchFn,
  })
  const rates = ratesMap(rateRows)

  const page = await listSubscriptions(
    db,
    userId,
    { limit: 100, offset: 0, sort: 'next-payment', order: 'asc' },
    now,
  )

  let monthlyTotalMinor = 0
  const unconvertible = new Set<string>()

  for (const subscription of page.items) {
    const monthly = monthlyEquivalentMinor(
      subscription.price,
      subscription.cycleUnit as CycleUnit,
      subscription.cycleCount,
    )
    const rate = crossRate(subscription.currency, settings.currency, rates)

    if (rate === null) {
      unconvertible.add(subscription.currency)
      continue
    }

    monthlyTotalMinor += convertMinorUnits(
      monthly,
      rate,
      subscription.currency,
      settings.currency,
    )
  }

  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const upcoming = page.items
    .filter((item) => item.nextDue <= horizon)
    .slice(0, 10)
  const overdueCount = page.items.filter((item) => item.overdue).length

  await upsertCostSnapshot(
    db,
    userId,
    now,
    monthlyTotalMinor,
    settings.currency,
  )

  const previous = await previousSnapshot(db, userId, now)
  const change = previous
    ? {
        amountMinor: monthlyTotalMinor - previous.totalMinor,
        since: `${previous.year}-${String(previous.month).padStart(2, '0')}`,
      }
    : null

  return {
    currency: settings.currency,
    locale: settings.locale,
    monthlyTotalMinor,
    change,
    upcoming,
    overdueCount,
    unconvertibleCurrencies: [...unconvertible].sort(),
    subscriptionCount: page.total,
  }
}
