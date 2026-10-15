import { and, asc, count, eq, isNull, max } from 'drizzle-orm'
import { paymentMethod, subscription } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export type PaymentMethod = typeof paymentMethod.$inferSelect

export type PaymentMethodInput = {
  name: string
  icon?: string | null
}

export type PurgeResult =
  | { status: 'deleted' }
  | { status: 'in-use'; references: number }
  | { status: 'not-found' }

export async function listPaymentMethods(
  db: Database,
  userId: string,
  params: { limit: number; offset: number; includeArchived?: boolean },
): Promise<{ items: PaymentMethod[]; total: number }> {
  const filters = [eq(paymentMethod.userId, userId)]
  if (!params.includeArchived) {
    filters.push(isNull(paymentMethod.archivedAt))
  }
  const where = and(...filters)

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(paymentMethod)
      .where(where)
      .orderBy(asc(paymentMethod.position), asc(paymentMethod.name))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ value: count() }).from(paymentMethod).where(where),
  ])

  return { items, total: totals[0]?.value ?? 0 }
}

export async function getPaymentMethod(
  db: Database,
  userId: string,
  id: string,
): Promise<PaymentMethod | null> {
  const rows = await db
    .select()
    .from(paymentMethod)
    .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createPaymentMethod(
  db: Database,
  userId: string,
  input: PaymentMethodInput,
): Promise<PaymentMethod | null> {
  const [highest] = await db
    .select({ value: max(paymentMethod.position) })
    .from(paymentMethod)
    .where(eq(paymentMethod.userId, userId))

  const rows = await db
    .insert(paymentMethod)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      icon: input.icon ?? null,
      position: (highest?.value ?? -1) + 1,
      createdAt: new Date(),
    })
    .returning()

  return rows[0] ?? null
}

export async function updatePaymentMethod(
  db: Database,
  userId: string,
  id: string,
  patch: Partial<PaymentMethodInput>,
): Promise<PaymentMethod | null> {
  const values: Partial<PaymentMethodInput> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.icon !== undefined) values.icon = patch.icon

  if (Object.keys(values).length === 0) {
    return getPaymentMethod(db, userId, id)
  }

  const rows = await db
    .update(paymentMethod)
    .set(values)
    .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
    .returning()

  return rows[0] ?? null
}

/** Soft delete: subscriptions keep resolving to the row. */
export async function archivePaymentMethod(
  db: Database,
  userId: string,
  id: string,
): Promise<PaymentMethod | null> {
  const rows = await db
    .update(paymentMethod)
    .set({ archivedAt: new Date() })
    .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function restorePaymentMethod(
  db: Database,
  userId: string,
  id: string,
): Promise<PaymentMethod | null> {
  const rows = await db
    .update(paymentMethod)
    .set({ archivedAt: null })
    .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
    .returning()

  return rows[0] ?? null
}

/**
 * Real delete, refused while any subscription still points at the row — the
 * guard and the delete share a transaction so a reference cannot slip in
 * between the count and the delete.
 */
export async function purgePaymentMethod(
  db: Database,
  userId: string,
  id: string,
): Promise<PurgeResult> {
  return db.transaction((tx): PurgeResult => {
    const existing = tx
      .select({ id: paymentMethod.id })
      .from(paymentMethod)
      .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
      .get()

    if (!existing) {
      return { status: 'not-found' }
    }

    const references =
      tx
        .select({ value: count() })
        .from(subscription)
        .where(eq(subscription.paymentMethodId, id))
        .get()?.value ?? 0

    if (references > 0) {
      return { status: 'in-use', references }
    }

    tx.delete(paymentMethod)
      .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
      .run()

    return { status: 'deleted' }
  })
}

/**
 * Applies a new order in one transaction. The given ids are renumbered from
 * zero; any row left out (archived rows the caller did not see) keeps its
 * relative order after them, so no two rows can collide on a position. Ids
 * that are not the user's, or that repeat, reject the whole call.
 */
export async function reorderPaymentMethods(
  db: Database,
  userId: string,
  ids: string[],
): Promise<boolean> {
  return db.transaction((tx) => {
    const rows = tx
      .select({ id: paymentMethod.id })
      .from(paymentMethod)
      .where(eq(paymentMethod.userId, userId))
      .orderBy(asc(paymentMethod.position), asc(paymentMethod.name))
      .all()

    const owned = new Set(rows.map((row) => row.id))
    const seen = new Set<string>()
    for (const id of ids) {
      if (!owned.has(id) || seen.has(id)) {
        return false
      }
      seen.add(id)
    }

    const ordered = [
      ...ids,
      ...rows.filter((row) => !seen.has(row.id)).map((row) => row.id),
    ]

    ordered.forEach((id, index) => {
      tx.update(paymentMethod)
        .set({ position: index })
        .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
        .run()
    })

    return true
  })
}
