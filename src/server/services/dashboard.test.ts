import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { costSnapshot } from '@/lib/auth-schema'
import {
  getDashboardSummary,
  monthlyEquivalentMinor,
  upsertCostSnapshot,
} from '@/server/services/dashboard'
import { createSubscription } from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

const payload = {
  base: 'EUR',
  date: '2026-10-14',
  rates: { DKK: 7.46 },
}

const now = new Date('2026-10-14T12:00:00.000Z')

function fakeFetch(payloadValue: unknown) {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => payloadValue,
  })
  return { fetchFn }
}

describe('dashboard: monthly normalization', () => {
  it('normalizes cycles to a monthly equivalent', () => {
    expect(monthlyEquivalentMinor(19900, 'months', 1)).toBe(19900)
    expect(monthlyEquivalentMinor(120000, 'years', 1)).toBe(10000)
    expect(monthlyEquivalentMinor(29900, 'months', 3)).toBe(9967)
    expect(monthlyEquivalentMinor(10000, 'weeks', 4)).toBe(10871)
  })
})

describe('dashboard: summary', () => {
  it('converts mixed currencies to the main currency and totals them', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'DKK Sub',
        price: 19900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-11-08T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'EUR Sub',
        price: 1000,
        currency: 'EUR',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-11-01T00:00:00.000Z'),
      },
      now,
    )

    const summary = await getDashboardSummary(db, 'u1', {
      now,
      fetchFn: fakeFetch(payload).fetchFn,
    })

    expect(summary.currency).toBe('DKK')
    expect(summary.monthlyTotalMinor).toBe(19900 + 7460)
    expect(summary.unconvertibleCurrencies).toEqual([])
    expect(summary.subscriptionCount).toBe(2)
  })

  it('reports currencies it cannot convert instead of guessing', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'USD Sub',
        price: 999,
        currency: 'USD',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-11-01T00:00:00.000Z'),
      },
      now,
    )

    const summary = await getDashboardSummary(db, 'u1', {
      now,
      fetchFn: fakeFetch(payload).fetchFn,
    })

    expect(summary.monthlyTotalMinor).toBe(0)
    expect(summary.unconvertibleCurrencies).toEqual(['USD'])
  })

  it('lists upcoming rolled payments within 30 days and counts overdue', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Stale Monthly',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-09-01T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'Far Future',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2027-06-01T00:00:00.000Z'),
      },
      now,
    )

    const summary = await getDashboardSummary(db, 'u1', {
      now,
      fetchFn: fakeFetch(payload).fetchFn,
    })

    expect(summary.upcoming.map((item) => item.name)).toEqual(['Stale Monthly'])
    expect(summary.upcoming[0]?.nextDue).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    )
    expect(summary.upcoming[0]?.overdue).toBe(true)
    expect(summary.overdueCount).toBe(1)
  })

  it('records a monthly snapshot and reports the change since last month', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Sub',
        price: 27360,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-11-01T00:00:00.000Z'),
      },
      now,
    )

    await db.insert(costSnapshot).values({
      id: crypto.randomUUID(),
      userId: 'u1',
      year: 2026,
      month: 9,
      totalMinor: 25000,
      currency: 'DKK',
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
    })

    const summary = await getDashboardSummary(db, 'u1', {
      now,
      fetchFn: fakeFetch(payload).fetchFn,
    })

    expect(summary.change).toEqual({
      amountMinor: 2360,
      since: '2026-09',
    })

    const current = await db
      .select()
      .from(costSnapshot)
      .where(
        and(
          eq(costSnapshot.userId, 'u1'),
          eq(costSnapshot.year, 2026),
          eq(costSnapshot.month, 10),
        ),
      )
    expect(current).toHaveLength(1)
    expect(current[0]?.totalMinor).toBe(27360)
  })

  it('upserts the snapshot idempotently', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await upsertCostSnapshot(db, 'u1', now, 12345, 'DKK')
    await upsertCostSnapshot(db, 'u1', now, 23456, 'DKK')

    const rows = await db
      .select()
      .from(costSnapshot)
      .where(eq(costSnapshot.userId, 'u1'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.totalMinor).toBe(23456)
  })
})
