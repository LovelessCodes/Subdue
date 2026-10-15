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
 *
 * One transaction, so a failure part-way through cannot leave a half-seeded
 * account that the stamp then keeps from ever seeing its categories.
 */
export async function seedDefaults(
  db: Database,
  userId: string,
  locale: string,
  options: { seed?: boolean } = {},
): Promise<SeedResult> {
  const set = defaultSeedSet(locale)
  const wanted = options.seed !== false
  const stamp = { locale, onboardedAt: new Date() }

  return db.transaction((tx): SeedResult => {
    const row = tx
      .select({ onboardedAt: userSetting.onboardedAt })
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .get()

    if (row?.onboardedAt) {
      return { seeded: false, paymentMethods: 0, categories: 0 }
    }

    const methodTotals = tx
      .select({ value: count() })
      .from(paymentMethod)
      .where(eq(paymentMethod.userId, userId))
      .get()
    const categoryTotals = tx
      .select({ value: count() })
      .from(category)
      .where(eq(category.userId, userId))
      .get()
    const hasOwnRows =
      (methodTotals?.value ?? 0) > 0 || (categoryTotals?.value ?? 0) > 0
    const seed = wanted && !hasOwnRows

    if (seed) {
      const now = new Date()
      tx.insert(paymentMethod)
        .values(
          set.paymentMethods.map((method, index) => ({
            id: crypto.randomUUID(),
            userId,
            name: method.name,
            icon: method.icon,
            position: index,
            createdAt: now,
          })),
        )
        .run()
      tx.insert(category)
        .values(
          set.categories.map((entry, index) => ({
            id: crypto.randomUUID(),
            userId,
            name: entry.name,
            color: entry.color,
            position: index,
            createdAt: now,
          })),
        )
        .run()
    }

    if (row) {
      tx.update(userSetting)
        .set(stamp)
        .where(eq(userSetting.userId, userId))
        .run()
    } else {
      tx.insert(userSetting)
        .values({ id: crypto.randomUUID(), userId, ...stamp })
        .run()
    }

    return {
      seeded: seed,
      paymentMethods: seed ? set.paymentMethods.length : 0,
      categories: seed ? set.categories.length : 0,
    }
  })
}
