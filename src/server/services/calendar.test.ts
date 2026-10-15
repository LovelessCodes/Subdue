import { describe, expect, it } from 'vitest'
import { toIsoDay } from '@/lib/money'
import { getCalendarMonth } from '@/server/services/calendar'
import { createIncomeSource } from '@/server/services/income-sources'
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

const options = { now, fetchFn: fakeFetch(payload).fetchFn }

describe('calendar service', () => {
  it('projects a stale monthly subscription into the visible months', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Gym',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-09-01T00:00:00.000Z'),
      },
      now,
    )

    const october = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 10 },
      options,
    )
    expect(october.entries.map((entry) => entry.date)).toEqual([
      new Date('2026-10-01T00:00:00.000Z'),
    ])
    expect(october.entries[0]?.overdue).toBe(true)

    const november = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 11 },
      options,
    )
    expect(november.entries[0]?.overdue).toBe(false)

    const september = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 9 },
      options,
    )
    expect(september.entries[0]?.date).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    )
    expect(september.entries[0]?.overdue).toBe(false)
  })

  it('keeps anniversary dates for quarterly and yearly cycles', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Quarterly',
        price: 1000,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 3,
        nextPayment: new Date('2026-01-31T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'Annual',
        price: 120000,
        currency: 'DKK',
        cycleUnit: 'years',
        cycleCount: 1,
        nextPayment: new Date('2026-06-15T00:00:00.000Z'),
      },
      now,
    )

    const july = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 7 },
      options,
    )
    expect(july.entries.map((entry) => entry.name)).toEqual(['Quarterly'])
    expect(july.entries[0]?.date).toEqual(new Date('2026-07-31T00:00:00.000Z'))

    const december = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 12 },
      options,
    )
    expect(december.entries).toEqual([])

    const april2027 = await getCalendarMonth(
      db,
      'u1',
      { year: 2027, month: 4 },
      options,
    )
    expect(april2027.entries.map((entry) => entry.name)).toEqual(['Quarterly'])
    expect(april2027.entries[0]?.date).toEqual(
      new Date('2027-04-30T00:00:00.000Z'),
    )

    const june2027 = await getCalendarMonth(
      db,
      'u1',
      { year: 2027, month: 6 },
      options,
    )
    expect(june2027.entries.map((entry) => entry.name)).toEqual(['Annual'])
  })

  it('converts the month total and flags unconvertible currencies', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'DKK Sub',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-11-01T00:00:00.000Z'),
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
        nextPayment: new Date('2026-11-05T00:00:00.000Z'),
      },
      now,
    )

    const summary = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 11 },
      options,
    )

    expect(summary.totalMinor).toBe(9900 + 7460)
    expect(summary.currency).toBe('DKK')
    expect(summary.unconvertibleCurrencies).toEqual([])
    expect(summary.entries.map((entry) => entry.name)).toEqual([
      'DKK Sub',
      'EUR Sub',
    ])
  })

  it('reports currencies without rates honestly', async () => {
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

    const summary = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 11 },
      options,
    )

    expect(summary.totalMinor).toBe(0)
    expect(summary.unconvertibleCurrencies).toEqual(['USD'])
  })
})

describe('calendar: income arrivals', () => {
  it('projects paydays into the month, converted and summed', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createIncomeSource(db, 'u1', {
      name: 'Full-time job',
      amountMinor: 2450000,
      currency: 'DKK',
      cycleUnit: 'months',
      cycleCount: 1,
      nextArrival: new Date('2026-09-25T00:00:00.000Z'),
    })
    await createIncomeSource(db, 'u1', {
      name: 'Part-time job',
      amountMinor: 1000,
      currency: 'EUR',
      cycleUnit: 'weeks',
      cycleCount: 2,
      nextArrival: new Date('2026-09-18T00:00:00.000Z'),
    })

    const october = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 10 },
      options,
    )

    expect(
      october.income.map((entry) => [
        entry.name,
        entry.date.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['Part-time job', '2026-10-02'],
      ['Part-time job', '2026-10-16'],
      ['Full-time job', '2026-10-25'],
      ['Part-time job', '2026-10-30'],
    ])
    expect(october.arrivingMinor).toBe(2450000 + 3 * 7460)

    const september = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 9 },
      options,
    )
    expect(september.income.map((entry) => entry.date.toISOString())).toEqual([
      '2026-09-18T00:00:00.000Z',
      '2026-09-25T00:00:00.000Z',
    ])
    expect(september.arrivingMinor).toBe(2450000 + 7460)
  })

  it('shows the pay before the recorded next arrival, floored by the start date', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createIncomeSource(db, 'u1', {
      name: 'Full-time job',
      amountMinor: 99900,
      currency: 'DKK',
      cycleUnit: 'months',
      cycleCount: 1,
      nextArrival: new Date('2026-11-01T00:00:00.000Z'),
      startDate: new Date('2026-10-01T00:00:00.000Z'),
    })

    const october = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 10 },
      options,
    )
    expect(
      october.income.map((entry) => [entry.name, toIsoDay(entry.date)]),
    ).toEqual([['Full-time job', '2026-10-01']])
    expect(october.arrivingMinor).toBe(99900)

    const september = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 9 },
      options,
    )
    expect(september.income).toEqual([])
    expect(september.arrivingMinor).toBe(0)
  })
})

describe('calendar: end dates', () => {
  it('stops projecting occurrences after the subscription ends', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Ends Mid-October',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-01T00:00:00.000Z'),
        cancelledAt: new Date('2026-10-15T00:00:00.000Z'),
      },
      now,
    )

    const october = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 10 },
      options,
    )
    expect(october.entries.map((entry) => entry.date)).toEqual([
      new Date('2026-10-01T00:00:00.000Z'),
    ])
    expect(october.totalMinor).toBe(9900)

    const november = await getCalendarMonth(
      db,
      'u1',
      { year: 2026, month: 11 },
      options,
    )
    expect(november.entries).toEqual([])
  })
})
