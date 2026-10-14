import { and, asc, count, eq } from 'drizzle-orm'
import { paymentMethod } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export type PaymentMethod = typeof paymentMethod.$inferSelect

export type PaymentMethodInput = {
  name: string
  icon?: string | null
}

export async function listPaymentMethods(
  db: Database,
  userId: string,
  params: { limit: number; offset: number },
): Promise<{ items: PaymentMethod[]; total: number }> {
  const where = eq(paymentMethod.userId, userId)

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(paymentMethod)
      .where(where)
      .orderBy(asc(paymentMethod.name))
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
  const rows = await db
    .insert(paymentMethod)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      icon: input.icon ?? null,
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

export async function deletePaymentMethod(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(paymentMethod)
    .where(and(eq(paymentMethod.id, id), eq(paymentMethod.userId, userId)))
    .returning({ id: paymentMethod.id })

  return rows.length > 0
}
