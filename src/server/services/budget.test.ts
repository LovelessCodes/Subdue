import { describe, expect, it } from 'vitest'
import { getBudgetPeriod, getBudgetStatus } from '@/server/services/budget'
import { createSubscription } from '@/server/services/subscriptions'
import { updateSettings } from '@/server/services/settings'
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

describe('budget: period math', () => {
  it('uses calendar months when no anchor is set', () => {
    const period = getBudgetPeriod(now, null)

    expect(period.start).toEqual(new Date('2026-10-01T00:00:00.000Z'))
    expect(period.end).toEqual(new Date('2026-10-31T00:00:00.000Z'))
    expect(period.anchored).toBe(false)
  })

  it('treats a day-1 anchor as calendar months too', () => {
    expect(getBudgetPeriod(now, 1).anchored).toBe(false)
  })

  it('anchors the period to the pay day', () => {
    const period = getBudgetPeriod(now, 25)

    expect(period.start).toEqual(new Date('2026-09-25T00:00:00.000Z'))
    expect(period.end).toEqual(new Date('2026-10-24T00:00:00.000Z'))
  })

  it('starts a new anchored period on the anchor day', () => {
    const period = getBudgetPeriod(new Date('2026-10-25T08:00:00.000Z'), 25)

    expect(period.start).toEqual(new Date('2026-10-25T00:00:00.000Z'))
    expect(period.end).toEqual(new Date('2026-11-24T00:00:00.000Z'))
  })

  it('clamps anchor days to short months', () => {
    const midFebruary = getBudgetPeriod(
      new Date('2026-02-15T12:00:00.000Z'),
      31,
    )
    expect(midFebruary.start).toEqual(new Date('2026-01-31T00:00:00.000Z'))
    expect(midFebruary.end).toEqual(new Date('2026-02-27T00:00:00.000Z'))

    const paydayFebruary = getBudgetPeriod(
      new Date('2026-02-28T12:00:00.000Z'),
      31,
    )
    expect(paydayFebruary.start).toEqual(new Date('2026-02-28T00:00:00.000Z'))
    expect(paydayFebruary.end).toEqual(new Date('2026-03-30T00:00:00.000Z'))
  })
})

describe('budget: status', () => {
  it('sums the charges due inside the anchored period', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await updateSettings(db, 'u1', {
      budgetAmountMinor: 20000,
      payAnchorDay: 25,
    })

    await createSubscription(
      db,
      'u1',
      {
        name: 'Inside Period',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-01T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'After Period',
        price: 19900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-28T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'Far Away',
        price: 120000,
        currency: 'DKK',
        cycleUnit: 'years',
        cycleCount: 1,
        nextPayment: new Date('2027-06-15T00:00:00.000Z'),
      },
      now,
    )

    const status = await getBudgetStatus(db, 'u1', options)

    expect(status.period.start).toEqual(new Date('2026-09-25T00:00:00.000Z'))
    expect(status.dueMinor).toBe(9900)
    expect(status.budgetMinor).toBe(20000)
    expect(status.remainingMinor).toBe(10100)
    expect(status.overBudget).toBe(false)
  })

  it('flags over-budget periods and converts foreign occurrences', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await updateSettings(db, 'u1', { budgetAmountMinor: 5000 })

    await createSubscription(
      db,
      'u1',
      {
        name: 'EUR Sub',
        price: 1000,
        currency: 'EUR',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-05T00:00:00.000Z'),
      },
      now,
    )

    const status = await getBudgetStatus(db, 'u1', options)

    expect(status.dueMinor).toBe(7460)
    expect(status.overBudget).toBe(true)
    expect(status.remainingMinor).toBe(5000 - 7460)
  })

  it('reports the period due even without a budget', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Sub',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-15T00:00:00.000Z'),
      },
      now,
    )

    const status = await getBudgetStatus(db, 'u1', options)

    expect(status.period.anchored).toBe(false)
    expect(status.budgetMinor).toBeNull()
    expect(status.remainingMinor).toBeNull()
    expect(status.dueMinor).toBe(9900)
  })
})
