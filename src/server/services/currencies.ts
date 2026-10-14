import { sql } from 'drizzle-orm'
import { exchangeRate } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { convertMinorUnits } from '../../lib/money'

export const ECB_BASE = 'EUR'
export const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR'

export type ExchangeRate = typeof exchangeRate.$inferSelect

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export function ratesMap(rows: ExchangeRate[]): Map<string, number> {
  return new Map([
    [ECB_BASE, 1],
    ...rows.map((row) => [row.quote, row.rate] as const),
  ])
}

export function crossRate(
  from: string,
  to: string,
  rates: Map<string, number>,
): number | null {
  if (from === to) {
    return 1
  }

  const fromRate = rates.get(from)
  const toRate = rates.get(to)
  if (!fromRate || !toRate) {
    return null
  }

  return toRate / fromRate
}

export async function getRates(db: Database): Promise<ExchangeRate[]> {
  return db
    .select()
    .from(exchangeRate)
    .orderBy(sql`${exchangeRate.quote} asc`)
}

export function isStale(rows: ExchangeRate[], now: Date): boolean {
  if (rows.length === 0) {
    return true
  }

  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )
  const latestFetch = Math.max(...rows.map((row) => row.fetchedAt.getTime()))
  return latestFetch < startOfToday
}

export async function refreshRates(
  db: Database,
  options: { fetchFn?: Fetcher; now?: Date } = {},
): Promise<ExchangeRate[]> {
  const fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as Fetcher)
  const now = options.now ?? new Date()

  const response = await fetchFn(FRANKFURTER_URL)
  if (!response.ok) {
    throw new Error(`Exchange rate fetch failed (status ${response.status})`)
  }

  const payload = (await response.json()) as {
    date?: string
    rates?: Record<string, number>
  }

  if (!payload.date || !payload.rates) {
    throw new Error('Exchange rate payload malformed')
  }

  const rateDate = new Date(`${payload.date}T00:00:00.000Z`)
  const entries = Object.entries(payload.rates).filter(
    ([quote, rate]) => Number.isFinite(rate) && quote !== ECB_BASE,
  )

  await db
    .insert(exchangeRate)
    .values(
      entries.map(([quote, rate]) => ({
        id: crypto.randomUUID(),
        quote,
        rate,
        rateDate,
        fetchedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: exchangeRate.quote,
      set: {
        rate: sql`excluded.rate`,
        rateDate: sql`excluded.rate_date`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    })

  const quotes = entries.map(([quote]) => quote)
  if (quotes.length > 0) {
    await db
      .delete(exchangeRate)
      .where(sql`${exchangeRate.quote} not in ${quotes}`)
  }

  return getRates(db)
}

export async function ensureRates(
  db: Database,
  options: { fetchFn?: Fetcher; now?: Date } = {},
): Promise<{ rows: ExchangeRate[]; stale: boolean }> {
  const now = options.now ?? new Date()
  const existing = await getRates(db)

  if (!isStale(existing, now)) {
    return { rows: existing, stale: false }
  }

  try {
    return {
      rows: await refreshRates(db, { fetchFn: options.fetchFn, now }),
      stale: false,
    }
  } catch (error) {
    if (existing.length > 0) {
      return { rows: existing, stale: true }
    }
    throw error
  }
}

export async function convertMinor(
  db: Database,
  params: { amount: number; from: string; to: string },
  options: { fetchFn?: Fetcher; now?: Date } = {},
): Promise<{
  amount: number
  converted: number
  rate: number
  rateDate: Date | null
  stale: boolean
} | null> {
  const from = params.from.toUpperCase()
  const to = params.to.toUpperCase()

  if (from === to) {
    return {
      amount: params.amount,
      converted: params.amount,
      rate: 1,
      rateDate: null,
      stale: false,
    }
  }

  const { rows, stale } = await ensureRates(db, options)
  const rate = crossRate(from, to, ratesMap(rows))

  if (rate === null) {
    return null
  }

  const latestRateDate = rows.reduce<Date | null>(
    (latest, row) => (!latest || row.rateDate > latest ? row.rateDate : latest),
    null,
  )

  return {
    amount: params.amount,
    converted: convertMinorUnits(params.amount, rate, from, to),
    rate,
    rateDate: latestRateDate,
    stale,
  }
}
