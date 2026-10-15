import { eq, sql } from 'drizzle-orm'
import { category, paymentMethod, userSetting } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export type SeedPaymentMethod = { name: string; icon: string | null }
export type SeedCategory = { name: string; color: string }

export type SeedSet = {
  paymentMethods: SeedPaymentMethod[]
  categories: SeedCategory[]
}

const VISA: SeedPaymentMethod = { name: 'Visa', icon: '/brands/visa.svg' }
const MASTERCARD: SeedPaymentMethod = {
  name: 'MasterCard',
  icon: '/brands/mastercard.svg',
}

// Brand names are proper nouns and stay as they are; the two descriptive
// methods are translated, as are the category names.
const SEED_SETS: Record<string, SeedSet> = {
  en: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debit card', icon: '/brands/debit.svg' },
      { name: 'Bank transfer', icon: null },
    ],
    categories: [
      { name: 'Entertainment', color: '#7c3aed' },
      { name: 'Utilities', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Housing', color: '#b45309' },
      { name: 'Subscriptions', color: '#be123c' },
    ],
  },
  de: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'EC-Karte', icon: '/brands/debit.svg' },
      { name: 'Überweisung', icon: null },
    ],
    categories: [
      { name: 'Unterhaltung', color: '#7c3aed' },
      { name: 'Nebenkosten', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Wohnen', color: '#b45309' },
      { name: 'Abonnements', color: '#be123c' },
    ],
  },
  zh: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: '借记卡', icon: '/brands/debit.svg' },
      { name: '银行转账', icon: null },
    ],
    categories: [
      { name: '娱乐', color: '#7c3aed' },
      { name: '水电杂费', color: '#0369a1' },
      { name: '软件', color: '#0f766e' },
      { name: '住房', color: '#b45309' },
      { name: '订阅', color: '#be123c' },
    ],
  },
  da: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debetkort', icon: '/brands/debit.svg' },
      { name: 'Bankoverførsel', icon: null },
    ],
    categories: [
      { name: 'Underholdning', color: '#7c3aed' },
      { name: 'Forsyninger', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Bolig', color: '#b45309' },
      { name: 'Abonnementer', color: '#be123c' },
    ],
  },
  fr: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Carte de débit', icon: '/brands/debit.svg' },
      { name: 'Virement bancaire', icon: null },
    ],
    categories: [
      { name: 'Divertissement', color: '#7c3aed' },
      { name: 'Charges', color: '#0369a1' },
      { name: 'Logiciels', color: '#0f766e' },
      { name: 'Logement', color: '#b45309' },
      { name: 'Abonnements', color: '#be123c' },
    ],
  },
  sv: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Betalkort', icon: '/brands/debit.svg' },
      { name: 'Banköverföring', icon: null },
    ],
    categories: [
      { name: 'Underhållning', color: '#7c3aed' },
      { name: 'Hushållskostnader', color: '#0369a1' },
      { name: 'Programvara', color: '#0f766e' },
      { name: 'Boende', color: '#b45309' },
      { name: 'Prenumerationer', color: '#be123c' },
    ],
  },
  nb: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debetkort', icon: '/brands/debit.svg' },
      { name: 'Bankoverføring', icon: null },
    ],
    categories: [
      { name: 'Underholdning', color: '#7c3aed' },
      { name: 'Nyttetjenester', color: '#0369a1' },
      { name: 'Programvare', color: '#0f766e' },
      { name: 'Bolig', color: '#b45309' },
      { name: 'Abonnementer', color: '#be123c' },
    ],
  },
  // Faroese is the one set I am least sure of — worth a native check before
  // anyone relies on it.
  fo: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debetkort', icon: '/brands/debit.svg' },
      { name: 'Bankgreiðsla', icon: null },
    ],
    categories: [
      { name: 'Underhaldning', color: '#7c3aed' },
      { name: 'Húsarhaldskostnaður', color: '#0369a1' },
      { name: 'Tólbúnaður', color: '#0f766e' },
      { name: 'Bústaður', color: '#b45309' },
      { name: 'Áskriftir', color: '#be123c' },
    ],
  },
  uk: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Дебетова картка', icon: '/brands/debit.svg' },
      { name: 'Банківський переказ', icon: null },
    ],
    categories: [
      { name: 'Розваги', color: '#7c3aed' },
      { name: 'Комунальні послуги', color: '#0369a1' },
      { name: 'Програми', color: '#0f766e' },
      { name: 'Житло', color: '#b45309' },
      { name: 'Підписки', color: '#be123c' },
    ],
  },
  es: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Tarjeta de débito', icon: '/brands/debit.svg' },
      { name: 'Transferencia bancaria', icon: null },
    ],
    categories: [
      { name: 'Entretenimiento', color: '#7c3aed' },
      { name: 'Suministros', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Vivienda', color: '#b45309' },
      { name: 'Suscripciones', color: '#be123c' },
    ],
  },
}

export const SEED_LOCALES = Object.keys(SEED_SETS)

/** Matches on the language subtag, so `de-AT` and `en-GB` find their sets. */
export function defaultSeedSet(locale: string): SeedSet {
  const language = locale.split('-')[0]?.toLowerCase() ?? ''
  return SEED_SETS[language] ?? SEED_SETS.en
}

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
    .select({
      onboardedAt: userSetting.onboardedAt,
      paymentMethods: sql<number>`(select count(*) from ${paymentMethod} where ${paymentMethod.userId} = ${userId})`,
      categories: sql<number>`(select count(*) from ${category} where ${category.userId} = ${userId})`,
    })
    .from(userSetting)
    .where(eq(userSetting.userId, userId))
    .limit(1)

  const row = existing[0]
  if (row?.onboardedAt) {
    return { seeded: false, paymentMethods: 0, categories: 0 }
  }

  const wanted = options.seed !== false
  const hasOwnRows =
    (row?.paymentMethods ?? 0) > 0 || (row?.categories ?? 0) > 0
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
