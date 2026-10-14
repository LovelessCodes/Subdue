import { and, asc, count, desc, eq, getTableColumns } from 'drizzle-orm'
import { paymentMethod, subscription } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { isOverdue, rolledNextPayment, type CycleUnit } from './recurrence'

export type Subscription = typeof subscription.$inferSelect

export type SubscriptionWithRecurrence = Subscription & {
  nextDue: Date
  overdue: boolean
  paymentMethodName: string | null
}

export type SubscriptionInput = {
  name: string
  price: number
  currency: string
  cycleUnit: CycleUnit
  cycleCount: number
  categoryId?: string | null
  paymentMethodId?: string | null
  payer?: string | null
  url?: string | null
  nextPayment: Date
  notes?: string | null
  remindDaysBefore?: number | null
  autoRenew?: boolean
  cancelledAt?: Date | null
  logo?: string | null
}

export const sortKeys = ['next-payment', 'name', 'price', 'created-at'] as const
export type SortKey = (typeof sortKeys)[number]

type SubscriptionRow = Subscription & { paymentMethodName?: string | null }

function withRecurrence(
  row: SubscriptionRow,
  now: Date,
): SubscriptionWithRecurrence {
  const cycle = { count: row.cycleCount, unit: row.cycleUnit as CycleUnit }

  return {
    ...row,
    nextDue: rolledNextPayment(row.nextPayment, cycle, now),
    overdue: isOverdue(row.nextPayment, now),
    paymentMethodName: row.paymentMethodName ?? null,
  }
}

export async function listSubscriptions(
  db: Database,
  userId: string,
  params: {
    limit: number
    offset: number
    categoryId?: string
    sort: SortKey
    order: 'asc' | 'desc'
  },
  now: Date = new Date(),
): Promise<{ items: SubscriptionWithRecurrence[]; total: number }> {
  const sortColumns = {
    'next-payment': subscription.nextPayment,
    name: subscription.name,
    price: subscription.price,
    'created-at': subscription.createdAt,
  } as const

  const filters = [eq(subscription.userId, userId)]
  if (params.categoryId) {
    filters.push(eq(subscription.categoryId, params.categoryId))
  }
  const where = and(...filters)
  const column = sortColumns[params.sort]

  const [items, totals] = await Promise.all([
    db
      .select({
        ...getTableColumns(subscription),
        paymentMethodName: paymentMethod.name,
      })
      .from(subscription)
      .leftJoin(
        paymentMethod,
        eq(subscription.paymentMethodId, paymentMethod.id),
      )
      .where(where)
      .orderBy(params.order === 'desc' ? desc(column) : asc(column))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ value: count() }).from(subscription).where(where),
  ])

  return {
    items: items.map((item) => withRecurrence(item, now)),
    total: totals[0]?.value ?? 0,
  }
}

export async function getSubscription(
  db: Database,
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<SubscriptionWithRecurrence | null> {
  const rows = await db
    .select({
      ...getTableColumns(subscription),
      paymentMethodName: paymentMethod.name,
    })
    .from(subscription)
    .leftJoin(paymentMethod, eq(subscription.paymentMethodId, paymentMethod.id))
    .where(and(eq(subscription.id, id), eq(subscription.userId, userId)))
    .limit(1)

  const row = rows[0]
  return row ? withRecurrence(row, now) : null
}

export async function createSubscription(
  db: Database,
  userId: string,
  input: SubscriptionInput,
  now: Date = new Date(),
): Promise<SubscriptionWithRecurrence | null> {
  const rows = await db
    .insert(subscription)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      price: input.price,
      currency: input.currency,
      cycleUnit: input.cycleUnit,
      cycleCount: input.cycleCount,
      categoryId: input.categoryId ?? null,
      paymentMethodId: input.paymentMethodId ?? null,
      payer: input.payer ?? null,
      url: input.url ?? null,
      nextPayment: input.nextPayment,
      notes: input.notes ?? null,
      remindDaysBefore: input.remindDaysBefore ?? null,
      autoRenew: input.autoRenew ?? true,
      cancelledAt: input.cancelledAt ?? null,
      logo: input.logo ?? null,
      createdAt: new Date(),
    })
    .returning()

  const row = rows[0]
  return row ? withRecurrence(row, now) : null
}

export async function updateSubscription(
  db: Database,
  userId: string,
  id: string,
  patch: Partial<SubscriptionInput>,
  now: Date = new Date(),
): Promise<SubscriptionWithRecurrence | null> {
  const values: Partial<SubscriptionInput> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.price !== undefined) values.price = patch.price
  if (patch.currency !== undefined) values.currency = patch.currency
  if (patch.cycleUnit !== undefined) values.cycleUnit = patch.cycleUnit
  if (patch.cycleCount !== undefined) values.cycleCount = patch.cycleCount
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId
  if (patch.paymentMethodId !== undefined) {
    values.paymentMethodId = patch.paymentMethodId
  }
  if (patch.payer !== undefined) values.payer = patch.payer
  if (patch.url !== undefined) values.url = patch.url
  if (patch.nextPayment !== undefined) values.nextPayment = patch.nextPayment
  if (patch.notes !== undefined) values.notes = patch.notes
  if (patch.remindDaysBefore !== undefined) {
    values.remindDaysBefore = patch.remindDaysBefore
  }
  if (patch.autoRenew !== undefined) values.autoRenew = patch.autoRenew
  if (patch.cancelledAt !== undefined) values.cancelledAt = patch.cancelledAt
  if (patch.logo !== undefined) values.logo = patch.logo

  if (Object.keys(values).length === 0) {
    return getSubscription(db, userId, id, now)
  }

  const rows = await db
    .update(subscription)
    .set(values)
    .where(and(eq(subscription.id, id), eq(subscription.userId, userId)))
    .returning()

  const row = rows[0]
  return row ? withRecurrence(row, now) : null
}

export async function deleteSubscription(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(subscription)
    .where(and(eq(subscription.id, id), eq(subscription.userId, userId)))
    .returning({ id: subscription.id })

  return rows.length > 0
}
