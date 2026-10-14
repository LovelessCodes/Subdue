import { describe, expect, it } from 'vitest'
import {
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

  it('flags stale stored due dates as overdue', async () => {
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

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.type).toBe('overdue')
    expect(candidates[0]?.dueDate).toEqual(new Date('2026-09-01T00:00:00.000Z'))
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
    expect(await unreadCount(db, 'u1')).toBe(1)
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
})
