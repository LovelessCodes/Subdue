import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { category, paymentMethod, userSetting } from '@/lib/auth-schema'
import { defaultSeedSet, seedDefaults } from '@/server/services/defaults'
import { createTestDb, insertTestUser } from '@/test/db'

describe('defaultSeedSet', () => {
  it('matches on the language subtag and falls back to English', () => {
    expect(defaultSeedSet('de-AT').paymentMethods[2]?.name).toBe('EC-Karte')
    expect(defaultSeedSet('en-GB').categories[0]?.name).toBe('Entertainment')
    expect(defaultSeedSet('zh').categories[0]?.name).toBe('娱乐')
    expect(defaultSeedSet('xx-YY').categories[0]?.name).toBe('Entertainment')
  })

  it('keeps the two brand methods untranslated in every language', () => {
    for (const locale of [
      'en',
      'de',
      'zh',
      'da',
      'fr',
      'sv',
      'nb',
      'fo',
      'uk',
      'es',
    ]) {
      const set = defaultSeedSet(locale)
      expect(set.paymentMethods[0]?.name).toBe('Visa')
      expect(set.paymentMethods[1]?.name).toBe('MasterCard')
      expect(set.paymentMethods[0]?.icon).toBe('/brands/visa.svg')
      expect(set.paymentMethods[3]?.icon).toBeNull()
      expect(set.categories).toHaveLength(5)
    }
  })
})

describe('seedDefaults', () => {
  it('seeds four methods and five categories, then stamps the flag', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const result = await seedDefaults(db, 'u1', 'en')
    expect(result).toMatchObject({
      seeded: true,
      paymentMethods: 4,
      categories: 5,
    })

    const methods = await db
      .select()
      .from(paymentMethod)
      .where(eq(paymentMethod.userId, 'u1'))
    expect(methods).toHaveLength(4)
    expect(methods.map((method) => method.position)).toEqual([0, 1, 2, 3])

    const categories = await db
      .select()
      .from(category)
      .where(eq(category.userId, 'u1'))
    expect(categories).toHaveLength(5)
    expect(categories[4]?.name).toBe('Subscriptions')

    const settings = await db
      .select()
      .from(userSetting)
      .where(eq(userSetting.userId, 'u1'))
    expect(settings[0]?.locale).toBe('en')
    expect(settings[0]?.onboardedAt).toBeInstanceOf(Date)
  })

  it('runs once — a second call reports nothing to do and adds no rows', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    await seedDefaults(db, 'u1', 'de')
    const again = await seedDefaults(db, 'u1', 'de')

    expect(again.seeded).toBe(false)
    expect(
      await db.select().from(category).where(eq(category.userId, 'u1')),
    ).toHaveLength(5)
  })

  it('stamps the locale without seeding when the user declines', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const result = await seedDefaults(db, 'u1', 'fr', { seed: false })

    expect(result.seeded).toBe(false)
    expect(
      await db
        .select()
        .from(paymentMethod)
        .where(eq(paymentMethod.userId, 'u1')),
    ).toHaveLength(0)
    const settings = await db
      .select()
      .from(userSetting)
      .where(eq(userSetting.userId, 'u1'))
    expect(settings[0]?.locale).toBe('fr')
  })

  it('leaves a user who made their own rows alone', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await db.insert(category).values({
      id: crypto.randomUUID(),
      userId: 'u1',
      name: 'Mine',
      position: 0,
      createdAt: new Date(),
    })

    const result = await seedDefaults(db, 'u1', 'en')

    expect(result.seeded).toBe(false)
    expect(
      await db.select().from(category).where(eq(category.userId, 'u1')),
    ).toHaveLength(1)
  })

  it('keeps each user to their own seeds', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    await seedDefaults(db, 'u1', 'en')
    await seedDefaults(db, 'u2', 'de')

    const german = await db
      .select()
      .from(category)
      .where(eq(category.userId, 'u2'))
    expect(german.map((entry) => entry.name)).toContain('Abonnements')
    expect(
      await db.select().from(category).where(eq(category.userId, 'u1')),
    ).toHaveLength(5)
  })
})
