import SqliteDatabase from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { unzipSync } from 'fflate'
import { category, paymentMethod, subscription } from '../../lib/auth-schema'
import { parseCsv } from '../../lib/csv'
import type { Database } from '../../lib/db'
import { fromIsoDay, minorUnitExponent } from '../../lib/money'
import { createCategory } from './categories'
import { createPaymentMethod } from './payment-methods'
import { cycleUnits, type CycleUnit } from './recurrence'
import { createSubscription } from './subscriptions'

export const MAX_IMPORT_SUBSCRIPTIONS = 5000

export type ParsedSubscription = {
  name: string
  price: number
  currency: string
  cycleUnit: CycleUnit
  cycleCount: number
  nextPayment: Date
  category: string | null
  payer: string | null
  notes: string | null
  remindDaysBefore: number | null
}

export type ParsedImport = {
  subscriptions: ParsedSubscription[]
  categories: string[]
  paymentMethods: string[]
  warnings: string[]
}

export type ImportReport = {
  dryRun: boolean
  subscriptions: { created: number; skippedDuplicates: number }
  categories: { created: number; existing: number }
  paymentMethods: { created: number; existing: number }
  warnings: string[]
}

type Row = Record<string, unknown>

const SELECT_CANDIDATES: Record<string, string[]> = {
  currencies: ['id', 'code'],
  cycles: ['id', 'days'],
  categories: ['id', 'name'],
  household: ['id', 'name'],
  payment_methods: ['name'],
  subscriptions: [
    'id',
    'name',
    'price',
    'currency_id',
    'next_payment',
    'cycle',
    'frequency',
    'notes',
    'category_id',
    'payer_user_id',
    'inactive',
    'notify_days_before',
  ],
}

function selectAvailable(
  sqlite: SqliteDatabase.Database,
  table: string,
  candidates: string[],
): Row[] {
  const info = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
  }[]
  const available = new Set(info.map((column) => column.name))
  const present = candidates.filter((column) => available.has(column))
  if (present.length === 0) {
    return []
  }
  return sqlite
    .prepare(`SELECT ${present.join(', ')} FROM ${table}`)
    .all() as Row[]
}

export function parseWallosBackup(
  file: Uint8Array,
  options: { defaultCurrency: string },
): ParsedImport {
  const magic = new TextDecoder().decode(file.slice(0, 16))
  const bytes = magic.startsWith('SQLite format 3')
    ? file
    : extractWallosDatabase(file)

  const sqlite = new SqliteDatabase(Buffer.from(bytes))
  try {
    return readWallosDatabase(sqlite, options)
  } finally {
    sqlite.close()
  }
}

function extractWallosDatabase(file: Uint8Array): Uint8Array {
  const entries = unzipSync(file, {
    filter: (entry) => entry.name.toLowerCase().endsWith('.db'),
  })
  const names = Object.keys(entries)
  const name =
    names.find(
      (candidate) => candidate.split('/').pop()?.toLowerCase() === 'wallos.db',
    ) ?? names[0]
  const bytes = name ? entries[name] : undefined
  if (!bytes) {
    throw new Error('Wallos backup archive does not contain a database file')
  }
  return bytes
}

function cycleFromDays(
  days: number,
): { unit: CycleUnit; count: number } | null {
  if (days <= 0) {
    return null
  }
  if (days === 7) {
    return { unit: 'weeks', count: 1 }
  }
  if (days === 30) {
    return { unit: 'months', count: 1 }
  }
  if (days === 365) {
    return { unit: 'years', count: 1 }
  }
  return { unit: 'days', count: days }
}

function parseRemindDays(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const days = Number(value)
  if (!Number.isFinite(days) || days < 0) {
    return null
  }
  return Math.min(Math.round(days), 60)
}

function readWallosDatabase(
  sqlite: SqliteDatabase.Database,
  options: { defaultCurrency: string },
): ParsedImport {
  const warnings: string[] = []

  const currencyCodes = new Map<number, string>()
  for (const row of selectAvailable(
    sqlite,
    'currencies',
    SELECT_CANDIDATES.currencies ?? [],
  )) {
    currencyCodes.set(Number(row.id), String(row.code ?? '').toUpperCase())
  }

  const cycleDays = new Map<number, number>()
  for (const row of selectAvailable(
    sqlite,
    'cycles',
    SELECT_CANDIDATES.cycles ?? [],
  )) {
    cycleDays.set(Number(row.id), Number(row.days))
  }

  const categoryNames = new Map<number, string>()
  for (const row of selectAvailable(
    sqlite,
    'categories',
    SELECT_CANDIDATES.categories ?? [],
  )) {
    categoryNames.set(Number(row.id), String(row.name ?? ''))
  }

  const householdNames = new Map<number, string>()
  for (const row of selectAvailable(
    sqlite,
    'household',
    SELECT_CANDIDATES.household ?? [],
  )) {
    householdNames.set(Number(row.id), String(row.name ?? ''))
  }

  const categories: string[] = []
  for (const row of selectAvailable(
    sqlite,
    'categories',
    SELECT_CANDIDATES.categories ?? [],
  )) {
    const name = String(row.name ?? '').trim()
    if (name && name.toLowerCase() !== 'no category') {
      categories.push(name)
    }
  }

  const paymentMethods: string[] = []
  for (const row of selectAvailable(
    sqlite,
    'payment_methods',
    SELECT_CANDIDATES.payment_methods ?? [],
  )) {
    const name = String(row.name ?? '').trim()
    if (name) {
      paymentMethods.push(name)
    }
  }

  const subscriptions: ParsedSubscription[] = []
  let skippedInactive = 0
  let skippedOneTime = 0
  let currencyFallbacks = 0
  let invalidRows = 0

  for (const row of selectAvailable(
    sqlite,
    'subscriptions',
    SELECT_CANDIDATES.subscriptions ?? [],
  )) {
    const name = String(row.name ?? '').trim()
    if (!name) {
      invalidRows += 1
      continue
    }
    if (Number(row.inactive ?? 0) === 1) {
      skippedInactive += 1
      continue
    }

    const days = cycleDays.get(Number(row.cycle)) ?? 30
    const cycle = cycleFromDays(days)
    if (!cycle) {
      skippedOneTime += 1
      continue
    }
    const frequency = Math.max(1, Math.round(Number(row.frequency) || 1))

    let currency = currencyCodes.get(Number(row.currency_id))
    if (!currency) {
      currency = options.defaultCurrency.toUpperCase()
      currencyFallbacks += 1
    }

    const day =
      typeof row.next_payment === 'string' ? row.next_payment.slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      invalidRows += 1
      continue
    }

    const price = Number(row.price)
    if (!Number.isFinite(price)) {
      invalidRows += 1
      continue
    }

    const rawCategory = categoryNames.get(Number(row.category_id))?.trim()
    const categoryOut =
      rawCategory && rawCategory.toLowerCase() !== 'no category'
        ? rawCategory
        : null
    if (categoryOut) {
      categories.push(categoryOut)
    }

    subscriptions.push({
      name,
      price: Math.round(price * 10 ** minorUnitExponent(currency)),
      currency,
      cycleUnit: cycle.unit,
      cycleCount: cycle.count * frequency,
      nextPayment: fromIsoDay(day),
      category: categoryOut,
      payer: householdNames.get(Number(row.payer_user_id)) ?? null,
      notes:
        typeof row.notes === 'string' && row.notes.trim() ? row.notes : null,
      remindDaysBefore: parseRemindDays(row.notify_days_before),
    })
  }

  if (skippedInactive > 0) {
    warnings.push(`Skipped ${skippedInactive} inactive subscriptions.`)
  }
  if (skippedOneTime > 0) {
    warnings.push(
      `Skipped ${skippedOneTime} one-time payments — Subdue tracks subscriptions only.`,
    )
  }
  if (currencyFallbacks > 0) {
    warnings.push(
      `${currencyFallbacks} subscriptions had no known currency and were imported as ${options.defaultCurrency.toUpperCase()}.`,
    )
  }
  if (invalidRows > 0) {
    warnings.push(
      `Skipped ${invalidRows} subscriptions with missing or invalid data.`,
    )
  }
  warnings.push(
    'Logos, URLs, auto-renew flags, and payment-method links are not part of Subdue yet and were not imported.',
  )

  return {
    subscriptions,
    categories: [...new Set(categories)],
    paymentMethods: [...new Set(paymentMethods)],
    warnings,
  }
}

const CSV_ALIASES: Record<string, string> = {
  name: 'name',
  price: 'price',
  priceminor: 'price',
  currency: 'currency',
  cycleunit: 'cycleUnit',
  cyclecount: 'cycleCount',
  frequency: 'cycleCount',
  nextpayment: 'nextPayment',
  category: 'category',
  payer: 'payer',
  notes: 'notes',
  reminddaysbefore: 'remindDaysBefore',
}

const CSV_REQUIRED = [
  'name',
  'price',
  'currency',
  'cycleUnit',
  'cycleCount',
  'nextPayment',
]

export function parseSubscriptionsCsv(csvText: string): ParsedImport {
  const rows = parseCsv(csvText)
  const header = rows[0]
  if (!header || header.length < 2) {
    throw new Error('CSV is empty')
  }

  const index = new Map<string, number>()
  header.forEach((cell, position) => {
    const key =
      CSV_ALIASES[
        cell
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
      ]
    if (key && !index.has(key)) {
      index.set(key, position)
    }
  })

  const missing = CSV_REQUIRED.filter((key) => !index.has(key))
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(', ')}`)
  }

  const cell = (row: string[], key: string): string => {
    const position = index.get(key)
    return position === undefined ? '' : (row[position] ?? '').trim()
  }

  const subscriptions: ParsedSubscription[] = []
  const categories: string[] = []
  const warnings: string[] = []
  let invalidRows = 0

  for (const row of rows.slice(1)) {
    const name = cell(row, 'name')
    const price = Number(cell(row, 'price'))
    const currency = cell(row, 'currency').toUpperCase()
    const cycleUnit = cell(row, 'cycleUnit').toLowerCase()
    const cycleCount = Number(cell(row, 'cycleCount'))
    const day = cell(row, 'nextPayment').slice(0, 10)

    if (
      !name ||
      !Number.isFinite(price) ||
      !currency ||
      !cycleUnits.includes(cycleUnit as CycleUnit) ||
      !Number.isInteger(cycleCount) ||
      cycleCount < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day)
    ) {
      invalidRows += 1
      continue
    }

    const categoryOut = cell(row, 'category') || null
    if (categoryOut) {
      categories.push(categoryOut)
    }

    const remindDays = cell(row, 'remindDaysBefore')
    const remindDaysBefore = remindDays === '' ? null : Number(remindDays)

    subscriptions.push({
      name,
      price: Math.round(price),
      currency,
      cycleUnit: cycleUnit as CycleUnit,
      cycleCount,
      nextPayment: fromIsoDay(day),
      category: categoryOut,
      payer: cell(row, 'payer') || null,
      notes: cell(row, 'notes') || null,
      remindDaysBefore:
        remindDaysBefore === null || Number.isFinite(remindDaysBefore)
          ? remindDaysBefore
          : null,
    })
  }

  if (invalidRows > 0) {
    warnings.push(`Skipped ${invalidRows} rows with missing or invalid data.`)
  }

  return {
    subscriptions,
    categories: [...new Set(categories)],
    paymentMethods: [],
    warnings,
  }
}

export async function runImport(
  db: Database,
  userId: string,
  parsed: ParsedImport,
  options: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const dryRun = options.dryRun ?? false

  if (parsed.subscriptions.length > MAX_IMPORT_SUBSCRIPTIONS) {
    throw new Error(
      `Import has too many subscriptions (max ${MAX_IMPORT_SUBSCRIPTIONS})`,
    )
  }

  const report: ImportReport = {
    dryRun,
    subscriptions: { created: 0, skippedDuplicates: 0 },
    categories: { created: 0, existing: 0 },
    paymentMethods: { created: 0, existing: 0 },
    warnings: [...parsed.warnings],
  }

  const existingCategories = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.userId, userId))
  const categoryIds = new Map(
    existingCategories.map((row) => [row.name.trim().toLowerCase(), row.id]),
  )

  const existingPaymentMethods = await db
    .select({ id: paymentMethod.id, name: paymentMethod.name })
    .from(paymentMethod)
    .where(eq(paymentMethod.userId, userId))
  const paymentMethodIds = new Map(
    existingPaymentMethods.map((row) => [
      row.name.trim().toLowerCase(),
      row.id,
    ]),
  )

  const wantedCategories = new Set<string>(parsed.categories)
  for (const item of parsed.subscriptions) {
    if (item.category) {
      wantedCategories.add(item.category)
    }
  }

  for (const name of wantedCategories) {
    const key = name.trim().toLowerCase()
    if (!key) {
      continue
    }
    if (categoryIds.has(key)) {
      report.categories.existing += 1
      continue
    }
    report.categories.created += 1
    if (!dryRun) {
      const row = await createCategory(db, userId, { name: name.trim() })
      if (row) {
        categoryIds.set(key, row.id)
      }
    }
  }

  for (const name of parsed.paymentMethods) {
    const key = name.trim().toLowerCase()
    if (!key) {
      continue
    }
    if (paymentMethodIds.has(key)) {
      report.paymentMethods.existing += 1
      continue
    }
    report.paymentMethods.created += 1
    if (!dryRun) {
      const row = await createPaymentMethod(db, userId, { name: name.trim() })
      if (row) {
        paymentMethodIds.set(key, row.id)
      }
    }
  }

  const existingSubscriptions = await db
    .select({ name: subscription.name })
    .from(subscription)
    .where(eq(subscription.userId, userId))
  const seenNames = new Set(
    existingSubscriptions.map((row) => row.name.trim().toLowerCase()),
  )

  for (const item of parsed.subscriptions) {
    const key = item.name.trim().toLowerCase()
    if (!key || seenNames.has(key)) {
      report.subscriptions.skippedDuplicates += 1
      continue
    }
    seenNames.add(key)
    report.subscriptions.created += 1

    if (!dryRun) {
      await createSubscription(db, userId, {
        name: item.name,
        price: item.price,
        currency: item.currency,
        cycleUnit: item.cycleUnit,
        cycleCount: item.cycleCount,
        nextPayment: item.nextPayment,
        categoryId: item.category
          ? (categoryIds.get(item.category.trim().toLowerCase()) ?? null)
          : null,
        payer: item.payer,
        notes: item.notes,
        remindDaysBefore: item.remindDaysBefore,
      })
    }
  }

  return report
}
