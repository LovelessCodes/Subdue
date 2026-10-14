import { asc, eq } from 'drizzle-orm'
import { category, paymentMethod, subscription } from '../../lib/auth-schema'
import { toCsv } from '../../lib/csv'
import type { Database } from '../../lib/db'
import { toIsoDay } from '../../lib/money'
import { getSettings, type Settings } from './settings'

export const EXPORT_VERSION = 1

export type ExportedSubscription = {
  name: string
  priceMinor: number
  currency: string
  cycleUnit: string
  cycleCount: number
  nextPayment: string
  category: string | null
  payer: string | null
  notes: string | null
  remindDaysBefore: number | null
}

export type ExportBundle = {
  app: 'subdue'
  version: number
  exportedAt: string
  settings: Settings
  categories: { name: string; color: string | null }[]
  paymentMethods: { name: string; icon: string | null }[]
  subscriptions: ExportedSubscription[]
}

export async function exportBundle(
  db: Database,
  userId: string,
): Promise<ExportBundle> {
  const [settings, categories, paymentMethods, subscriptions] =
    await Promise.all([
      getSettings(db, userId),
      db
        .select()
        .from(category)
        .where(eq(category.userId, userId))
        .orderBy(asc(category.name)),
      db
        .select()
        .from(paymentMethod)
        .where(eq(paymentMethod.userId, userId))
        .orderBy(asc(paymentMethod.name)),
      db
        .select()
        .from(subscription)
        .where(eq(subscription.userId, userId))
        .orderBy(asc(subscription.name)),
    ])

  const categoryNames = new Map(categories.map((row) => [row.id, row.name]))

  return {
    app: 'subdue',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    categories: categories.map((row) => ({ name: row.name, color: row.color })),
    paymentMethods: paymentMethods.map((row) => ({
      name: row.name,
      icon: row.icon,
    })),
    subscriptions: subscriptions.map((row) => ({
      name: row.name,
      priceMinor: row.price,
      currency: row.currency,
      cycleUnit: row.cycleUnit,
      cycleCount: row.cycleCount,
      nextPayment: toIsoDay(row.nextPayment),
      category: row.categoryId
        ? (categoryNames.get(row.categoryId) ?? null)
        : null,
      payer: row.payer,
      notes: row.notes,
      remindDaysBefore: row.remindDaysBefore,
    })),
  }
}

export const CSV_COLUMNS = [
  'name',
  'price_minor',
  'currency',
  'cycle_unit',
  'cycle_count',
  'next_payment',
  'category',
  'payer',
  'notes',
  'remind_days_before',
] as const

export async function exportSubscriptionsCsv(
  db: Database,
  userId: string,
): Promise<string> {
  const bundle = await exportBundle(db, userId)

  const rows: string[][] = [
    [...CSV_COLUMNS],
    ...bundle.subscriptions.map((item) => [
      item.name,
      String(item.priceMinor),
      item.currency,
      item.cycleUnit,
      String(item.cycleCount),
      item.nextPayment,
      item.category ?? '',
      item.payer ?? '',
      item.notes ?? '',
      item.remindDaysBefore === null ? '' : String(item.remindDaysBefore),
    ]),
  ]

  return toCsv(rows)
}

export function createBackup(db: Database, path: string): void {
  db.$client.prepare('VACUUM INTO ?').run(path)
}
