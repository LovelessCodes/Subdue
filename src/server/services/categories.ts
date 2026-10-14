import { and, asc, count, eq } from 'drizzle-orm'
import { category } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export type Category = typeof category.$inferSelect

export type CategoryInput = {
  name: string
  color?: string | null
}

export async function listCategories(
  db: Database,
  userId: string,
  params: { limit: number; offset: number },
): Promise<{ items: Category[]; total: number }> {
  const where = eq(category.userId, userId)

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(category)
      .where(where)
      .orderBy(asc(category.name))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ value: count() }).from(category).where(where),
  ])

  return { items, total: totals[0]?.value ?? 0 }
}

export async function getCategory(
  db: Database,
  userId: string,
  id: string,
): Promise<Category | null> {
  const rows = await db
    .select()
    .from(category)
    .where(and(eq(category.id, id), eq(category.userId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createCategory(
  db: Database,
  userId: string,
  input: CategoryInput,
): Promise<Category | null> {
  const rows = await db
    .insert(category)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      color: input.color ?? null,
      createdAt: new Date(),
    })
    .returning()

  return rows[0] ?? null
}

export async function updateCategory(
  db: Database,
  userId: string,
  id: string,
  patch: Partial<CategoryInput>,
): Promise<Category | null> {
  const values: Partial<CategoryInput> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.color !== undefined) values.color = patch.color

  if (Object.keys(values).length === 0) {
    return getCategory(db, userId, id)
  }

  const rows = await db
    .update(category)
    .set(values)
    .where(and(eq(category.id, id), eq(category.userId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteCategory(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(category)
    .where(and(eq(category.id, id), eq(category.userId, userId)))
    .returning({ id: category.id })

  return rows.length > 0
}
