import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { category, paymentMethod, userSetting } from '@/lib/auth-schema'
import { SEED_LOCALES, defaultSeedSet } from '@/lib/seed-sets'
import { seedDefaults } from '@/server/services/defaults'
import { createTestDb, insertTestUser } from '@/test/db'

describe('defaultSeedSet', () => {
  it('matches on the language subtag and falls back to English', () => {
    expect(defaultSeedSet('de-AT').paymentMethods[2]?.name).toBe('EC-Karte')
    expect(defaultSeedSet('en-GB').categories[0]?.name).toBe('Entertainment')
    expect(defaultSeedSet('zh').categories[0]?.name).toBe('娱乐')
    expect(defaultSeedSet('xx-YY').categories[0]?.name).toBe('Entertainment')
  })

  it('keeps the cards, PayPal, Stripe and the transfer in every language', () => {
    for (const locale of SEED_LOCALES) {
      const set = defaultSeedSet(locale)
      expect(set.paymentMethods[0]?.name).toBe('Visa')
      expect(set.paymentMethods[1]?.name).toBe('MasterCard')
      expect(set.paymentMethods[0]?.icon).toBe('/brands/visa.svg')
      expect(set.paymentMethods.at(-1)?.icon).toBeNull()
      expect(set.paymentMethods.at(-2)?.name).toBe('Stripe')
      expect(set.paymentMethods.at(-3)?.name).toBe('PayPal')
    }
  })

  it('adds insurance everywhere and the local categories where they fit', () => {
    const insurance: Record<string, string> = {
      en: 'Insurance',
      de: 'Versicherung',
      zh: '保险',
      da: 'Forsikring',
      fr: 'Assurance',
      sv: 'Försäkring',
      nb: 'Forsikring',
      fo: 'Trygging',
      uk: 'Страхування',
      es: 'Seguro',
    }
    const local: Record<string, string[]> = {
      de: ['Rundfunkbeitrag'],
      da: ['Fagforening', 'A-kasse'],
      sv: ['A-kassa'],
      nb: ['Fagforening', 'A-kasse'],
      fr: ['Mutuelle'],
      es: ['Comunidad de vecinos'],
      zh: ['话费'],
    }

    for (const locale of SEED_LOCALES) {
      const names = defaultSeedSet(locale).categories.map((entry) => entry.name)
      expect(names).toContain(insurance[locale])
      const localNames = local[locale] ?? []
      expect(names).toHaveLength(6 + localNames.length)
      for (const name of localNames) expect(names).toContain(name)
    }
  })

  it('adds the everyday app where a language has one', () => {
    const everyday: Record<string, Record<string, string>> = {
      da: { MobilePay: '/brands/mobilepay.svg' },
      sv: { Swish: '/brands/swish.png' },
      nb: { Vipps: '/brands/vipps.svg' },
      es: { Bizum: '/brands/bizum.svg' },
      zh: { 支付宝: '/brands/alipay.svg', 微信支付: '/brands/wechat-pay.svg' },
      uk: { Приват24: '/brands/privat24.png' },
    }

    for (const [locale, apps] of Object.entries(everyday)) {
      const methods = defaultSeedSet(locale).paymentMethods
      for (const [name, icon] of Object.entries(apps)) {
        const method = methods.find((entry) => entry.name === name)
        expect(method?.icon, `${locale}: ${name}`).toBe(icon)
      }
    }

    const lengths: Record<string, number> = {
      en: 6,
      de: 6,
      zh: 8,
      da: 7,
      fr: 6,
      sv: 7,
      nb: 7,
      fo: 6,
      uk: 7,
      es: 7,
    }
    for (const locale of SEED_LOCALES) {
      expect(defaultSeedSet(locale).paymentMethods).toHaveLength(
        lengths[locale] ?? 0,
      )
    }
  })

  it('points every icon at a file that exists', () => {
    for (const locale of SEED_LOCALES) {
      for (const method of defaultSeedSet(locale).paymentMethods) {
        if (!method.icon) continue
        const file = resolve('public', method.icon.replace(/^\//, ''))
        expect(existsSync(file), `${locale}: ${method.icon}`).toBe(true)
      }
    }
  })
})

describe('seedDefaults', () => {
  it('seeds the English defaults, then stamps the flag', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const result = await seedDefaults(db, 'u1', 'en')
    expect(result).toMatchObject({
      seeded: true,
      paymentMethods: 6,
      categories: 6,
    })

    const methods = await db
      .select()
      .from(paymentMethod)
      .where(eq(paymentMethod.userId, 'u1'))
    expect(methods).toHaveLength(6)
    expect(methods.map((method) => method.position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ])

    const categories = await db
      .select()
      .from(category)
      .where(eq(category.userId, 'u1'))
    expect(categories).toHaveLength(6)
    expect(categories[4]?.name).toBe('Subscriptions')
    expect(categories[5]?.name).toBe('Insurance')

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
    ).toHaveLength(7)
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
    ).toHaveLength(6)
  })
})
