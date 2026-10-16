import { asc, eq } from 'drizzle-orm'
import {
  category,
  incomeSource,
  paymentMethod,
  subscription,
} from '../../lib/auth-schema'
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
  paymentMethod: string | null
  payer: string | null
  url: string | null
  notes: string | null
  remindDaysBefore: number | null
  remindEnabled: boolean
  autoRenew: boolean
  cancelledAt: string | null
  logo: string | null
}

export type ExportedIncomeSource = {
  name: string
  amountMinor: number
  currency: string
  cycleUnit: string
  cycleCount: number
  nextArrival: string
  startDate: string | null
  archivedAt: string | null
}

export type ExportBundle = {
  app: 'subdue'
  version: number
  exportedAt: string
  settings: Settings
  categories: { name: string; color: string | null }[]
  paymentMethods: { name: string; icon: string | null }[]
  subscriptions: ExportedSubscription[]
  incomeSources: ExportedIncomeSource[]
}

export async function exportBundle(
  db: Database,
  userId: string,
): Promise<ExportBundle> {
  const [settings, categories, paymentMethods, subscriptions, sources] =
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
      db
        .select()
        .from(incomeSource)
        .where(eq(incomeSource.userId, userId))
        .orderBy(asc(incomeSource.name)),
    ])

  const categoryNames = new Map(categories.map((row) => [row.id, row.name]))
  const paymentMethodNames = new Map(
    paymentMethods.map((row) => [row.id, row.name]),
  )

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
      paymentMethod: row.paymentMethodId
        ? (paymentMethodNames.get(row.paymentMethodId) ?? null)
        : null,
      payer: row.payer,
      url: row.url,
      notes: row.notes,
      remindDaysBefore: row.remindDaysBefore,
      remindEnabled: row.remindEnabled ?? true,
      autoRenew: row.autoRenew ?? true,
      cancelledAt: row.cancelledAt ? toIsoDay(row.cancelledAt) : null,
      logo: row.logo,
    })),
    incomeSources: sources.map((row) => ({
      name: row.name,
      amountMinor: row.amountMinor,
      currency: row.currency,
      cycleUnit: row.cycleUnit,
      cycleCount: row.cycleCount,
      nextArrival: toIsoDay(row.nextArrival),
      startDate: row.startDate ? toIsoDay(row.startDate) : null,
      archivedAt: row.archivedAt ? toIsoDay(row.archivedAt) : null,
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
  'payment_method',
  'payer',
  'url',
  'notes',
  'remind_days_before',
  'remind_enabled',
  'auto_renew',
  'cancelled_at',
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
      item.paymentMethod ?? '',
      item.payer ?? '',
      item.url ?? '',
      item.notes ?? '',
      item.remindDaysBefore === null ? '' : String(item.remindDaysBefore),
      item.remindEnabled ? 'true' : 'false',
      item.autoRenew ? 'true' : 'false',
      item.cancelledAt ?? '',
    ]),
  ]

  return toCsv(rows)
}

export function createBackup(db: Database, path: string): void {
  db.$client.prepare('VACUUM INTO ?').run(path)
}
