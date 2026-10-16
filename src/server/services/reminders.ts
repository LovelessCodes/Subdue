import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { notification } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { formatDate, formatMinor } from '../../lib/money'
import type { Sender } from '../senders'
import type { ChannelType } from './channels'
import { dispatchUserDeliveries, enqueueDeliveries } from './deliveries'
import { getSettings } from './settings'
import {
  listSubscriptions,
  type SubscriptionWithRecurrence,
} from './subscriptions'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type ReminderType = 'upcoming'

export type ReminderCandidate = {
  subscriptionId: string
  name: string
  price: number
  currency: string
  type: ReminderType
  dueDate: Date
}

function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      MS_PER_DAY,
  )
}

export function reminderCandidates(
  subscriptions: SubscriptionWithRecurrence[],
  now: Date,
  defaultDaysBefore: number,
): ReminderCandidate[] {
  const today = dayNumber(now)
  const candidates: ReminderCandidate[] = []

  for (const subscription of subscriptions) {
    const endDay = subscription.cancelledAt
      ? dayNumber(subscription.cancelledAt)
      : null
    if (endDay !== null && endDay < today) {
      continue
    }

    const daysBefore = subscription.remindDaysBefore ?? defaultDaysBefore
    const daysUntil = dayNumber(subscription.nextDue) - today
    const dueBeforeEnd =
      endDay === null || dayNumber(subscription.nextDue) <= endDay

    if (dueBeforeEnd && daysUntil >= 0 && daysUntil <= daysBefore) {
      candidates.push({
        subscriptionId: subscription.id,
        name: subscription.name,
        price: subscription.price,
        currency: subscription.currency,
        type: 'upcoming',
        dueDate: subscription.nextDue,
      })
    }
  }

  return candidates
}

function messageFor(
  candidate: ReminderCandidate,
  locale: string,
): { title: string; body: string } {
  const date = formatDate(candidate.dueDate, locale)
  const amount = formatMinor(candidate.price, candidate.currency, locale)

  return {
    title: `${candidate.name} renews soon`,
    body: `${amount} due on ${date}.`,
  }
}

export async function runDueReminders(
  db: Database,
  userId: string,
  options: { now?: Date } = {},
): Promise<{ created: number; ids: string[] }> {
  const now = options.now ?? new Date()
  const settings = await getSettings(db, userId)
  if (!settings.remindersEnabled) {
    return { created: 0, ids: [] }
  }
  const page = await listSubscriptions(
    db,
    userId,
    { limit: 100, offset: 0, sort: 'next-payment', order: 'asc' },
    now,
  )
  const candidates = reminderCandidates(
    page.items,
    now,
    settings.remindDaysBefore,
  )

  let created = 0
  const ids: string[] = []

  for (const candidate of candidates) {
    const message = messageFor(candidate, settings.locale)
    const rows = await db
      .insert(notification)
      .values({
        id: crypto.randomUUID(),
        userId,
        subscriptionId: candidate.subscriptionId,
        type: candidate.type,
        dueDate: candidate.dueDate,
        title: message.title,
        body: message.body,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: notification.id })

    const row = rows[0]
    if (row) {
      created += 1
      ids.push(row.id)
    }
  }

  return { created, ids }
}

export async function listNotifications(
  db: Database,
  userId: string,
  params: { limit: number; unreadOnly?: boolean },
) {
  const filters = [eq(notification.userId, userId)]
  if (params.unreadOnly) {
    filters.push(isNull(notification.readAt))
  }

  return db
    .select()
    .from(notification)
    .where(and(...filters))
    .orderBy(desc(notification.createdAt))
    .limit(params.limit)
}

export async function unreadCount(
  db: Database,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)))

  return rows[0]?.value ?? 0
}

export async function markNotificationsRead(
  db: Database,
  userId: string,
  ids?: string[],
): Promise<number> {
  const filters = [eq(notification.userId, userId), isNull(notification.readAt)]
  if (ids && ids.length > 0) {
    filters.push(inArray(notification.id, ids))
  }

  const rows = await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(...filters))
    .returning({ id: notification.id })

  return rows.length
}

export type TickOptions = {
  now?: Date
  senders?: Partial<Record<ChannelType, Sender>>
}

export async function tickUser(
  db: Database,
  userId: string,
  options: TickOptions = {},
) {
  const now = options.now ?? new Date()
  const { ids } = await runDueReminders(db, userId, { now })
  if (ids.length > 0) {
    await enqueueDeliveries(db, userId, ids)
  }
  return dispatchUserDeliveries(db, userId, { now, senders: options.senders })
}

const tickTimestamps = new Map<string, number>()
const MIN_TICK_INTERVAL_MS = 15 * 60 * 1000

export async function maybeRunReminders(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const last = tickTimestamps.get(userId) ?? 0
  if (now.getTime() - last < MIN_TICK_INTERVAL_MS) {
    return
  }

  try {
    await tickUser(db, userId, { now })
    tickTimestamps.set(userId, now.getTime())
  } catch (error) {
    console.error('reminder tick failed', error)
  }
}
