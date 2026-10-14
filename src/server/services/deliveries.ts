import { and, asc, desc, eq, lt } from 'drizzle-orm'
import {
  channel,
  notification,
  notificationDelivery,
} from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import type { ChannelMessage, Sender } from '../senders'
import { decodeChannelConfig, type ChannelType } from './channels'

export const MAX_DELIVERY_ATTEMPTS = 3

export type DeliveryCounts = { sent: number; failed: number; pending: number }

export type DispatchOptions = {
  now?: Date
  limit?: number
  senders?: Partial<Record<ChannelType, Sender>>
}

export async function enqueueDeliveries(
  db: Database,
  userId: string,
  notificationIds: string[],
): Promise<number> {
  if (notificationIds.length === 0) {
    return 0
  }

  const targets = await db
    .select({ id: channel.id })
    .from(channel)
    .where(and(eq(channel.userId, userId), eq(channel.enabled, true)))

  if (targets.length === 0) {
    return 0
  }

  const rows = notificationIds.flatMap((notificationId) =>
    targets.map((target) => ({
      id: crypto.randomUUID(),
      userId,
      notificationId,
      channelId: target.id,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    })),
  )

  const inserted = await db
    .insert(notificationDelivery)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: notificationDelivery.id })

  return inserted.length
}

let queue: Promise<unknown> = Promise.resolve()

export function dispatchUserDeliveries(
  db: Database,
  userId: string,
  options: DispatchOptions = {},
): Promise<DeliveryCounts> {
  const run = queue.then(() => runDispatch(db, userId, options))
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function runDispatch(
  db: Database,
  userId: string,
  options: DispatchOptions,
): Promise<DeliveryCounts> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 20
  const defaultSenders = (await import('../senders')).senders
  const senderMap: Partial<Record<ChannelType, Sender>> = {
    ...defaultSenders,
    ...options.senders,
  }

  const rows = await db
    .select({
      delivery: notificationDelivery,
      title: notification.title,
      body: notification.body,
      channelType: channel.type,
      channelConfig: channel.config,
    })
    .from(notificationDelivery)
    .innerJoin(
      notification,
      eq(notificationDelivery.notificationId, notification.id),
    )
    .innerJoin(channel, eq(notificationDelivery.channelId, channel.id))
    .where(
      and(
        eq(notificationDelivery.userId, userId),
        eq(notificationDelivery.status, 'pending'),
        eq(channel.enabled, true),
        lt(notificationDelivery.attempts, MAX_DELIVERY_ATTEMPTS),
      ),
    )
    .orderBy(asc(notificationDelivery.createdAt))
    .limit(limit)

  const counts: DeliveryCounts = { sent: 0, failed: 0, pending: 0 }

  for (const row of rows) {
    const type = row.channelType as ChannelType
    const sender = senderMap[type]
    const message: ChannelMessage = { title: row.title, body: row.body }
    const attempts = row.delivery.attempts + 1

    try {
      if (!sender) {
        throw new Error(`unknown channel type ${type}`)
      }
      await sender(message, decodeChannelConfig(type, row.channelConfig))
      await db
        .update(notificationDelivery)
        .set({ status: 'sent', attempts, sentAt: now, lastError: null })
        .where(eq(notificationDelivery.id, row.delivery.id))
      counts.sent += 1
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error)
      const exhausted = attempts >= MAX_DELIVERY_ATTEMPTS
      await db
        .update(notificationDelivery)
        .set({
          status: exhausted ? 'failed' : 'pending',
          attempts,
          lastError,
        })
        .where(eq(notificationDelivery.id, row.delivery.id))
      if (exhausted) {
        counts.failed += 1
      } else {
        counts.pending += 1
      }
    }
  }

  return counts
}

export async function listDeliveries(
  db: Database,
  userId: string,
  limit: number,
) {
  return db
    .select({
      id: notificationDelivery.id,
      status: notificationDelivery.status,
      attempts: notificationDelivery.attempts,
      lastError: notificationDelivery.lastError,
      sentAt: notificationDelivery.sentAt,
      createdAt: notificationDelivery.createdAt,
      notificationTitle: notification.title,
      channelName: channel.name,
      channelType: channel.type,
    })
    .from(notificationDelivery)
    .innerJoin(
      notification,
      eq(notificationDelivery.notificationId, notification.id),
    )
    .innerJoin(channel, eq(notificationDelivery.channelId, channel.id))
    .where(eq(notificationDelivery.userId, userId))
    .orderBy(desc(notificationDelivery.createdAt))
    .limit(limit)
}
