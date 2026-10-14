import { describe, expect, it } from 'vitest'
import { createChannel } from '@/server/services/channels'
import {
  MAX_DELIVERY_ATTEMPTS,
  dispatchUserDeliveries,
  enqueueDeliveries,
  listDeliveries,
} from '@/server/services/deliveries'
import { runDueReminders, tickUser } from '@/server/services/reminders'
import { createSubscription } from '@/server/services/subscriptions'
import type { Database } from '@/lib/db'
import { createTestDb, insertTestUser } from '@/test/db'

const now = new Date('2026-10-14T12:00:00.000Z')

async function setUpDueReminder(db: Database, userId = 'u1') {
  await insertTestUser(db, userId)
  await createSubscription(
    db,
    userId,
    {
      name: 'Netflix',
      price: 9900,
      currency: 'DKK',
      cycleUnit: 'months',
      cycleCount: 1,
      nextPayment: new Date('2026-10-16T00:00:00.000Z'),
    },
    now,
  )
}

async function addWebhookChannel(db: Database, userId = 'u1') {
  return createChannel(db, userId, {
    type: 'webhook',
    name: 'Hook',
    config: { url: 'https://example.com/hook' },
  })
}

describe('deliveries', () => {
  it('enqueues and delivers through enabled channels', async () => {
    const { db } = createTestDb()
    await setUpDueReminder(db)
    await addWebhookChannel(db)

    const { ids } = await runDueReminders(db, 'u1', { now })
    expect(ids).toHaveLength(1)
    expect(await enqueueDeliveries(db, 'u1', ids)).toBe(1)

    const delivered: string[] = []
    const counts = await dispatchUserDeliveries(db, 'u1', {
      now,
      senders: {
        webhook: async (message) => {
          delivered.push(message.title)
        },
      },
    })

    expect(counts).toEqual({ sent: 1, failed: 0, pending: 0 })
    expect(delivered[0]).toContain('Netflix')

    const rows = await listDeliveries(db, 'u1', 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: 'sent',
      attempts: 1,
      channelType: 'webhook',
    })
  })

  it('skips disabled channels', async () => {
    const { db } = createTestDb()
    await setUpDueReminder(db)
    await createChannel(db, 'u1', {
      type: 'webhook',
      name: 'Hook',
      enabled: false,
      config: { url: 'https://example.com/hook' },
    })

    const { ids } = await runDueReminders(db, 'u1', { now })
    expect(await enqueueDeliveries(db, 'u1', ids)).toBe(0)
  })

  it('retries failures up to the cap', async () => {
    const { db } = createTestDb()
    await setUpDueReminder(db)
    await addWebhookChannel(db)

    const { ids } = await runDueReminders(db, 'u1', { now })
    await enqueueDeliveries(db, 'u1', ids)

    const failing = {
      webhook: async () => {
        throw new Error('boom')
      },
    }

    expect(
      await dispatchUserDeliveries(db, 'u1', { now, senders: failing }),
    ).toEqual({ sent: 0, failed: 0, pending: 1 })
    expect(
      await dispatchUserDeliveries(db, 'u1', { now, senders: failing }),
    ).toEqual({ sent: 0, failed: 0, pending: 1 })
    expect(
      await dispatchUserDeliveries(db, 'u1', { now, senders: failing }),
    ).toEqual({ sent: 0, failed: 1, pending: 0 })
    expect(
      await dispatchUserDeliveries(db, 'u1', { now, senders: failing }),
    ).toEqual({ sent: 0, failed: 0, pending: 0 })

    const rows = await listDeliveries(db, 'u1', 10)
    expect(rows[0]).toMatchObject({
      status: 'failed',
      attempts: MAX_DELIVERY_ATTEMPTS,
      lastError: 'boom',
    })
  })

  it('tickUser creates the reminder and delivers it in one pass', async () => {
    const { db } = createTestDb()
    await setUpDueReminder(db)
    await addWebhookChannel(db)

    const delivered: string[] = []
    const counts = await tickUser(db, 'u1', {
      now,
      senders: {
        webhook: async (message) => {
          delivered.push(message.title)
        },
      },
    })

    expect(counts.sent).toBe(1)
    expect(delivered).toHaveLength(1)
    expect(await listDeliveries(db, 'u1', 10)).toHaveLength(1)
  })
})
