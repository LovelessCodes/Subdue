import { describe, expect, it } from 'vitest'
import { tickAllUsers } from '@/server/scheduler'
import { createChannel } from '@/server/services/channels'
import { listDeliveries } from '@/server/services/deliveries'
import { createSubscription } from '@/server/services/subscriptions'
import type { Database } from '@/lib/db'
import { createTestDb, insertTestUser } from '@/test/db'

const now = new Date('2026-10-14T12:00:00.000Z')

async function armUser(db: Database, id: string) {
  await insertTestUser(db, id)
  await createSubscription(
    db,
    id,
    {
      name: `${id} sub`,
      price: 100,
      currency: 'DKK',
      cycleUnit: 'months',
      cycleCount: 1,
      nextPayment: new Date('2026-10-15T00:00:00.000Z'),
    },
    now,
  )
  await createChannel(db, id, {
    type: 'webhook',
    name: 'Hook',
    config: { url: 'https://example.com/hook' },
  })
}

describe('scheduler', () => {
  it('ticks every user and delivers their reminders', async () => {
    const { db } = createTestDb()
    await armUser(db, 'u1')
    await armUser(db, 'u2')

    const delivered: string[] = []
    const result = await tickAllUsers(db, {
      now,
      senders: {
        webhook: async (message) => {
          delivered.push(message.title)
        },
      },
    })

    expect(result).toEqual({ users: 2 })
    expect(delivered.sort()).toEqual([
      'u1 sub renews soon',
      'u2 sub renews soon',
    ])
    expect(await listDeliveries(db, 'u1', 5)).toHaveLength(1)
    expect(await listDeliveries(db, 'u2', 5)).toHaveLength(1)
  })

  it('no-ops on an empty instance', async () => {
    const { db } = createTestDb()
    expect(await tickAllUsers(db, { now })).toEqual({ users: 0 })
  })
})
