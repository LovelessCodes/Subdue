import { and, asc, count, eq, isNull, max } from 'drizzle-orm'
import { category, subscription } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export type Category = typeof category.$inferSelect

export type CategoryInput = {
  name: string
  color?: string | null
}

export type PurgeResult =
  | { status: 'deleted' }
  | { status: 'in-use'; references: number }
  | { status: 'not-found' }

export async function listCategories(
  db: Database,
  userId: string,
  params: { limit: number; offset: number; includeArchived?: boolean },
): Promise<{ items: Category[]; total: number }> {
  const filters = [eq(category.userId, userId)]
  if (!params.includeArchived) {
    filters.push(isNull(category.archivedAt))
  }
  const where = and(...filters)

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(category)
      .where(where)
      .orderBy(asc(category.position), asc(category.name))
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
  const [highest] = await db
    .select({ value: max(category.position) })
    .from(category)
    .where(eq(category.userId, userId))

  const rows = await db
    .insert(category)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      color: input.color ?? null,
      position: (highest?.value ?? -1) + 1,
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

/** Soft delete: subscriptions keep resolving to the row. */
export async function archiveCategory(
  db: Database,
  userId: string,
  id: string,
): Promise<Category | null> {
  const rows = await db
    .update(category)
    .set({ archivedAt: new Date() })
    .where(and(eq(category.id, id), eq(category.userId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function restoreCategory(
  db: Database,
  userId: string,
  id: string,
): Promise<Category | null> {
  const rows = await db
    .update(category)
    .set({ archivedAt: null })
    .where(and(eq(category.id, id), eq(category.userId, userId)))
    .returning()

  return rows[0] ?? null
}

/**
 * Real delete, refused while any subscription still points at the row — the
 * guard and the delete share a transaction so a reference cannot slip in
 * between the count and the delete.
 */
export async function purgeCategory(
  db: Database,
  userId: string,
  id: string,
): Promise<PurgeResult> {
  return db.transaction((tx): PurgeResult => {
    const existing = tx
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.id, id), eq(category.userId, userId)))
      .get()

    if (!existing) {
      return { status: 'not-found' }
    }

    const references =
      tx
        .select({ value: count() })
        .from(subscription)
        .where(eq(subscription.categoryId, id))
        .get()?.value ?? 0

    if (references > 0) {
      return { status: 'in-use', references }
    }

    tx.delete(category)
      .where(and(eq(category.id, id), eq(category.userId, userId)))
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
export async function reorderCategories(
  db: Database,
  userId: string,
  ids: string[],
): Promise<boolean> {
  return db.transaction((tx) => {
    const rows = tx
      .select({ id: category.id })
      .from(category)
      .where(eq(category.userId, userId))
      .orderBy(asc(category.position), asc(category.name))
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
      tx.update(category)
        .set({ position: index })
        .where(and(eq(category.id, id), eq(category.userId, userId)))
        .run()
    })

    return true
  })
}
