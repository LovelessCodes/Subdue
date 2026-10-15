import { count, eq } from 'drizzle-orm'
import { category, paymentMethod, userSetting } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { defaultSeedSet } from '../../lib/seed-sets'

export type SeedResult = {
  seeded: boolean
  paymentMethods: number
  categories: number
}

/**
 * Gives a new user something to pick from in the subscription form. Runs once:
 * the stamp is set whether or not the caller asked for seeds, and a user who
 * already made their own rows is left alone rather than handed duplicates.
 */
export async function seedDefaults(
  db: Database,
  userId: string,
  locale: string,
  options: { seed?: boolean } = {},
): Promise<SeedResult> {
  const existing = await db
    .select({ onboardedAt: userSetting.onboardedAt })
    .from(userSetting)
    .where(eq(userSetting.userId, userId))
    .limit(1)

  const row = existing[0]
  if (row?.onboardedAt) {
    return { seeded: false, paymentMethods: 0, categories: 0 }
  }

  const wanted = options.seed !== false
  const [methodTotals, categoryTotals] = await Promise.all([
    db
      .select({ value: count() })
      .from(paymentMethod)
      .where(eq(paymentMethod.userId, userId)),
    db
      .select({ value: count() })
      .from(category)
      .where(eq(category.userId, userId)),
  ])
  const hasOwnRows =
    (methodTotals[0]?.value ?? 0) > 0 || (categoryTotals[0]?.value ?? 0) > 0
  const set = defaultSeedSet(locale)
  const seed = wanted && !hasOwnRows

  if (seed) {
    const now = new Date()
    await db.insert(paymentMethod).values(
      set.paymentMethods.map((method, index) => ({
        id: crypto.randomUUID(),
        userId,
        name: method.name,
        icon: method.icon,
        position: index,
        createdAt: now,
      })),
    )
    await db.insert(category).values(
      set.categories.map((entry, index) => ({
        id: crypto.randomUUID(),
        userId,
        name: entry.name,
        color: entry.color,
        position: index,
        createdAt: now,
      })),
    )
  }

  const stamp = { locale, onboardedAt: new Date() }
  if (row) {
    await db
      .update(userSetting)
      .set(stamp)
      .where(eq(userSetting.userId, userId))
  } else {
    await db
      .insert(userSetting)
      .values({ id: crypto.randomUUID(), userId, ...stamp })
  }

  return {
    seeded: seed,
    paymentMethods: seed ? set.paymentMethods.length : 0,
    categories: seed ? set.categories.length : 0,
  }
}
