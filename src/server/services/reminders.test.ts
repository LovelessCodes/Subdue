import { describe, expect, it } from 'vitest'
import {
  inboxSummary,
  listNotifications,
  markNotificationsRead,
  reminderCandidates,
  runDueReminders,
  unreadCount,
} from '@/server/services/reminders'
import { updateSettings } from '@/server/services/settings'
import {
  createSubscription,
  listSubscriptions,
} from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

const now = new Date('2026-10-14T12:00:00.000Z')

const ratesPayload = {
  base: 'EUR',
  date: '2026-10-14',
  rates: { DKK: 7.46 },
}

function fakeFetch(payload: unknown) {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })
  return { fetchFn }
}

async function enrichedFor(
  db: Parameters<typeof listSubscriptions>[0],
  userId: string,
) {
  const page = await listSubscriptions(
    db,
    userId,
    { limit: 100, offset: 0, sort: 'next-payment', order: 'asc' },
    now,
  )
  return page.items
}

describe('reminder candidates', () => {
  it('fires inside the days-before window, inclusive', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'In Window',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-17T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'Outside Window',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-18T00:00:00.000Z'),
      },
      now,
    )

    const candidates = reminderCandidates(await enrichedFor(db, 'u1'), now, 3)

    expect(candidates.map((candidate) => candidate.name)).toEqual(['In Window'])
    expect(candidates[0]?.type).toBe('upcoming')
  })

  it('honors per-subscription overrides', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Early Bird',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-21T00:00:00.000Z'),
        remindDaysBefore: 14,
      },
      now,
    )

    const candidates = reminderCandidates(await enrichedFor(db, 'u1'), now, 3)

    expect(candidates.map((candidate) => candidate.name)).toEqual([
      'Early Bird',
    ])
  })

  it('lets stale stored due dates roll forward instead of flagging them', async () => {
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

    const candidates = reminderCandidates(await enrichedFor(db, 'u1'), now, 3)

    // The stored date is long past; the series has rolled to November, which
    // is outside the three-day window.
    expect(candidates).toHaveLength(0)
  })

  it('keeps a subscription quiet when its own notifications are off', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Loud',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-16T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'Quiet',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-16T00:00:00.000Z'),
        remindEnabled: false,
      },
      now,
    )

    const candidates = reminderCandidates(await enrichedFor(db, 'u1'), now, 3)

    expect(candidates.map((candidate) => candidate.name)).toEqual(['Loud'])
  })
})

describe('reminder runs', () => {
  it('creates notifications once and dedupes reruns', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await createSubscription(
      db,
      'u1',
      {
        name: 'Netflix',
        price: 19900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-16T00:00:00.000Z'),
      },
      now,
    )

    const first = await runDueReminders(db, 'u1', { now })
    const second = await runDueReminders(db, 'u1', { now })

    expect(first.created).toBe(1)
    expect(second.created).toBe(0)

    const items = await listNotifications(db, 'u1', { limit: 10 })
    expect(items).toHaveLength(1)
    expect(items[0]?.title).toContain('Netflix')
    expect(items[0]?.subscriptionName).toBe('Netflix')
    expect(items[0]?.subscriptionPrice).toBe(19900)
    expect(items[0]?.subscriptionCurrency).toBe('DKK')
    expect(items[0]?.subscriptionLogo).toBeNull()
    expect(await unreadCount(db, 'u1')).toBe(1)
  })

  it('totals reminders due within the week in the main currency', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await updateSettings(db, 'u1', { remindDaysBefore: 20 })

    await createSubscription(
      db,
      'u1',
      {
        name: 'Weekly DKK',
        price: 19900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-16T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'Weekly EUR',
        price: 500,
        currency: 'EUR',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-18T00:00:00.000Z'),
      },
      now,
    )
    await createSubscription(
      db,
      'u1',
      {
        name: 'Later DKK',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-30T00:00:00.000Z'),
      },
      now,
    )

    await runDueReminders(db, 'u1', { now })
    const items = await listNotifications(db, 'u1', { limit: 10 })
    expect(items).toHaveLength(3)

    const summary = await inboxSummary(db, 'u1', items, {
      now,
      ...fakeFetch(ratesPayload),
    })

    // 19900 DKK + 500 EUR minor at 7.46 = 3730 DKK; the third reminder
    // due in 16 days sits outside the window.
    expect(summary.weekTotalMinor).toBe(23630)
    expect(summary.currency).toBe('DKK')
    expect(summary.unconvertibleCurrencies).toEqual([])
  })

  it('uses the user default and marks notifications read', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await updateSettings(db, 'u1', { remindDaysBefore: 7 })

    await createSubscription(
      db,
      'u1',
      {
        name: 'Domain',
        price: 120000,
        currency: 'DKK',
        cycleUnit: 'years',
        cycleCount: 1,
        nextPayment: new Date('2026-10-20T00:00:00.000Z'),
      },
      now,
    )

    await runDueReminders(db, 'u1', { now })
    expect(await unreadCount(db, 'u1')).toBe(1)

    const marked = await markNotificationsRead(db, 'u1')
    expect(marked).toBe(1)
    expect(await unreadCount(db, 'u1')).toBe(0)

    const after = await listNotifications(db, 'u1', { limit: 10 })
    expect(after[0]?.readAt).not.toBeNull()
  })

  it('stays silent when reminders are switched off, overrides included', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await updateSettings(db, 'u1', { remindersEnabled: false })

    await createSubscription(
      db,
      'u1',
      {
        name: 'Netflix',
        price: 19900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-16T00:00:00.000Z'),
        remindDaysBefore: 7,
      },
      now,
    )

    const result = await runDueReminders(db, 'u1', { now })

    expect(result.created).toBe(0)
    expect(await unreadCount(db, 'u1')).toBe(0)
  })
})

describe('cancelled subscriptions', () => {
  it('stops reminding after the access end date has passed', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await createSubscription(
      db,
      'u1',
      {
        name: 'Ended Service',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-16T00:00:00.000Z'),
        cancelledAt: new Date('2026-10-05T00:00:00.000Z'),
      },
      now,
    )

    const candidates = reminderCandidates(await enrichedFor(db, 'u1'), now, 3)
    expect(candidates).toHaveLength(0)
  })

  it('keeps reminding while access continues', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await createSubscription(
      db,
      'u1',
      {
        name: 'Last Months',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-10-16T00:00:00.000Z'),
        cancelledAt: new Date('2026-10-20T00:00:00.000Z'),
      },
      now,
    )

    const candidates = reminderCandidates(await enrichedFor(db, 'u1'), now, 3)
    expect(candidates.map((candidate) => candidate.type)).toEqual(['upcoming'])
  })

  it('drops charges that land after the end date', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await createSubscription(
      db,
      'u1',
      {
        name: 'Due After End',
        price: 9900,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 1,
        nextPayment: new Date('2026-11-15T00:00:00.000Z'),
        cancelledAt: new Date('2026-10-20T00:00:00.000Z'),
      },
      now,
    )

    const candidates = reminderCandidates(await enrichedFor(db, 'u1'), now, 3)
    expect(candidates).toHaveLength(0)
  })
})
