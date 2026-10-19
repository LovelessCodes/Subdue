import { and, asc, count, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import {
  paymentMethod,
  subscription,
  subscriptionMember,
  user,
} from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import type { MemberStatus } from './sharing'
import { rolledNextPayment, type CycleUnit } from './recurrence'

export type Subscription = typeof subscription.$inferSelect

export type SubscriptionViewer = 'owner' | 'member'

export type SubscriptionShareView = {
  id: string
  shareMinor: number
  status: MemberStatus
}

export type SubscriptionWithRecurrence = Subscription & {
  nextDue: Date
  paymentMethodName: string | null
  viewer: SubscriptionViewer
  /** Set on member rows: the share this viewer holds. */
  member: SubscriptionShareView | null
  /** Set on member rows: who pays the bill. */
  ownerName: string | null
  /** Owner rows only: how many people the charge is split with. */
  sharedCount: number
}

export type SubscriptionInput = {
  name: string
  price: number
  currency: string
  cycleUnit: CycleUnit
  cycleCount: number
  categoryId?: string | null
  paymentMethodId?: string | null
  url?: string | null
  nextPayment: Date
  notes?: string | null
  remindDaysBefore?: number | null
  remindEnabled?: boolean
  autoRenew?: boolean
  cancelledAt?: Date | null
  logo?: string | null
}

export const sortKeys = ['next-payment', 'name', 'price', 'created-at'] as const
export type SortKey = (typeof sortKeys)[number]

type SubscriptionRow = Subscription & {
  paymentMethodName?: string | null
  sharedCount?: number
}

function withRecurrence(
  row: SubscriptionRow,
  now: Date,
  viewer: SubscriptionViewer = 'owner',
): SubscriptionWithRecurrence {
  const cycle = { count: row.cycleCount, unit: row.cycleUnit as CycleUnit }

  return {
    ...row,
    nextDue: rolledNextPayment(row.nextPayment, cycle, now),
    paymentMethodName: row.paymentMethodName ?? null,
    viewer,
    member: null,
    ownerName: null,
    sharedCount: row.sharedCount ?? 0,
  }
}

type MemberRow = {
  subscription: Subscription
  member: {
    id: string
    shareMinor: number
    status: string
    remindEnabled: boolean | null
    categoryId: string | null
  }
  ownerName: string
}

/**
 * A subscription seen through a member's eyes: their share as the price, and
 * the owner's notes, payment method and reminder lead removed.
 */
function memberItem(row: MemberRow, now: Date): SubscriptionWithRecurrence {
  const cycle = {
    count: row.subscription.cycleCount,
    unit: row.subscription.cycleUnit as CycleUnit,
  }

  return {
    ...row.subscription,
    price: row.member.shareMinor,
    categoryId: row.member.categoryId,
    paymentMethodId: null,
    paymentMethodName: null,
    notes: null,
    remindEnabled: row.member.remindEnabled ?? true,
    remindDaysBefore: null,
    userId: '',
    nextDue: rolledNextPayment(row.subscription.nextPayment, cycle, now),
    viewer: 'member',
    member: {
      id: row.member.id,
      shareMinor: row.member.shareMinor,
      status: row.member.status as MemberStatus,
    },
    ownerName: row.ownerName,
    sharedCount: 0,
  }
}

const memberSelection = {
  subscription: getTableColumns(subscription),
  member: {
    id: subscriptionMember.id,
    shareMinor: subscriptionMember.shareMinor,
    status: subscriptionMember.status,
    remindEnabled: subscriptionMember.remindEnabled,
    categoryId: subscriptionMember.categoryId,
  },
  ownerName: user.name,
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

  const memberFilters = [
    eq(subscriptionMember.userId, userId),
    eq(subscriptionMember.status, 'active'),
  ]
  if (params.categoryId) {
    memberFilters.push(eq(subscriptionMember.categoryId, params.categoryId))
  }

  // Owner rows are fetched up to the end of the requested page; member rows
  // are merged in JS so one viewer-aware list carries both kinds.
  const [ownerItems, ownerTotals, memberRows, memberTotals] = await Promise.all(
    [
      db
        .select({
          ...getTableColumns(subscription),
          paymentMethodName: paymentMethod.name,
          sharedCount: sql<number>`(select count(*) from ${subscriptionMember} where ${subscriptionMember.subscriptionId} = ${subscription.id})`,
        })
        .from(subscription)
        .leftJoin(
          paymentMethod,
          eq(subscription.paymentMethodId, paymentMethod.id),
        )
        .where(where)
        .orderBy(params.order === 'desc' ? desc(column) : asc(column))
        .limit(params.offset + params.limit),
      db.select({ value: count() }).from(subscription).where(where),
      db
        .select(memberSelection)
        .from(subscriptionMember)
        .innerJoin(
          subscription,
          eq(subscriptionMember.subscriptionId, subscription.id),
        )
        .innerJoin(user, eq(subscription.userId, user.id))
        .where(and(...memberFilters))
        .limit(params.offset + params.limit),
      db
        .select({ value: count() })
        .from(subscriptionMember)
        .where(and(...memberFilters)),
    ],
  )

  const merged = [
    ...ownerItems.map((row) => withRecurrence(row, now)),
    ...memberRows.map((row) => memberItem(row, now)),
  ]

  merged.sort((a, b) => {
    let diff = 0
    if (params.sort === 'next-payment') {
      diff = a.nextPayment.getTime() - b.nextPayment.getTime()
    } else if (params.sort === 'name') {
      diff = a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    } else if (params.sort === 'price') {
      diff = a.price - b.price
    } else {
      diff = a.createdAt.getTime() - b.createdAt.getTime()
    }
    return params.order === 'desc' ? -diff : diff
  })

  return {
    items: merged.slice(params.offset, params.offset + params.limit),
    total: (ownerTotals[0]?.value ?? 0) + (memberTotals[0]?.value ?? 0),
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
      url: input.url ?? null,
      nextPayment: input.nextPayment,
      notes: input.notes ?? null,
      remindDaysBefore: input.remindDaysBefore ?? null,
      remindEnabled: input.remindEnabled ?? true,
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
  if (patch.url !== undefined) values.url = patch.url
  if (patch.nextPayment !== undefined) values.nextPayment = patch.nextPayment
  if (patch.notes !== undefined) values.notes = patch.notes
  if (patch.remindDaysBefore !== undefined) {
    values.remindDaysBefore = patch.remindDaysBefore
  }
  if (patch.remindEnabled !== undefined) {
    values.remindEnabled = patch.remindEnabled
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
