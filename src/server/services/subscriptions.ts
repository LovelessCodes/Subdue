import { and, asc, count, desc, eq } from 'drizzle-orm'
import { subscription } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export type Subscription = typeof subscription.$inferSelect

export const cycleUnits = ['days', 'weeks', 'months', 'years'] as const
export type CycleUnit = (typeof cycleUnits)[number]

export type SubscriptionInput = {
  name: string
  price: number
  currency: string
  cycleUnit: CycleUnit
  cycleCount: number
  categoryId?: string | null
  payer?: string | null
  nextPayment: Date
  notes?: string | null
}

export const sortKeys = ['next-payment', 'name', 'price', 'created-at'] as const
export type SortKey = (typeof sortKeys)[number]

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
): Promise<{ items: Subscription[]; total: number }> {
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
      .select()
      .from(subscription)
      .where(where)
      .orderBy(params.order === 'desc' ? desc(column) : asc(column))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ value: count() }).from(subscription).where(where),
  ])

  return { items, total: totals[0]?.value ?? 0 }
}

export async function getSubscription(
  db: Database,
  userId: string,
  id: string,
): Promise<Subscription | null> {
  const rows = await db
    .select()
    .from(subscription)
    .where(and(eq(subscription.id, id), eq(subscription.userId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createSubscription(
  db: Database,
  userId: string,
  input: SubscriptionInput,
): Promise<Subscription | null> {
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
      payer: input.payer ?? null,
      nextPayment: input.nextPayment,
      notes: input.notes ?? null,
      createdAt: new Date(),
    })
    .returning()

  return rows[0] ?? null
}

export async function updateSubscription(
  db: Database,
  userId: string,
  id: string,
  patch: Partial<SubscriptionInput>,
): Promise<Subscription | null> {
  const values: Partial<SubscriptionInput> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.price !== undefined) values.price = patch.price
  if (patch.currency !== undefined) values.currency = patch.currency
  if (patch.cycleUnit !== undefined) values.cycleUnit = patch.cycleUnit
  if (patch.cycleCount !== undefined) values.cycleCount = patch.cycleCount
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId
  if (patch.payer !== undefined) values.payer = patch.payer
  if (patch.nextPayment !== undefined) values.nextPayment = patch.nextPayment
  if (patch.notes !== undefined) values.notes = patch.notes

  if (Object.keys(values).length === 0) {
    return getSubscription(db, userId, id)
  }

  const rows = await db
    .update(subscription)
    .set(values)
    .where(and(eq(subscription.id, id), eq(subscription.userId, userId)))
    .returning()

  return rows[0] ?? null
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
