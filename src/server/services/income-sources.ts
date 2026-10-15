import { and, asc, eq, isNull } from 'drizzle-orm'
import { incomeSource } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import {
  occurrencesBetween,
  previousOccurrence,
  rolledNextPayment,
  type Cycle,
  type CycleUnit,
} from './recurrence'

export type IncomeSource = typeof incomeSource.$inferSelect

export type IncomeSourceInput = {
  name: string
  amountMinor: number
  currency: string
  cycleUnit: CycleUnit
  cycleCount: number
  nextArrival: Date
}

export type IncomeArrival = {
  source: IncomeSource
  date: Date
}

/** The recurrence shape an income source pays on. */
export function sourceCycle(source: {
  cycleCount: number
  cycleUnit: string
}): Cycle {
  return { count: source.cycleCount, unit: source.cycleUnit as CycleUnit }
}

/** The next payday from today, rolling a stale stored date forward. */
export function nextArrival(source: IncomeSource, now: Date): Date {
  return rolledNextPayment(source.nextArrival, sourceCycle(source), now)
}

export async function listIncomeSources(
  db: Database,
  userId: string,
  params: { includeArchived?: boolean } = {},
): Promise<IncomeSource[]> {
  const filters = [eq(incomeSource.userId, userId)]
  if (!params.includeArchived) {
    filters.push(isNull(incomeSource.archivedAt))
  }

  return db
    .select()
    .from(incomeSource)
    .where(and(...filters))
    .orderBy(asc(incomeSource.createdAt), asc(incomeSource.name))
}

export async function getIncomeSource(
  db: Database,
  userId: string,
  id: string,
): Promise<IncomeSource | null> {
  const rows = await db
    .select()
    .from(incomeSource)
    .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createIncomeSource(
  db: Database,
  userId: string,
  input: IncomeSourceInput,
): Promise<IncomeSource | null> {
  const rows = await db
    .insert(incomeSource)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      amountMinor: input.amountMinor,
      currency: input.currency,
      cycleUnit: input.cycleUnit,
      cycleCount: input.cycleCount,
      nextArrival: input.nextArrival,
      createdAt: new Date(),
    })
    .returning()

  return rows[0] ?? null
}

export async function updateIncomeSource(
  db: Database,
  userId: string,
  id: string,
  patch: Partial<IncomeSourceInput>,
): Promise<IncomeSource | null> {
  const values: Partial<IncomeSourceInput> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.amountMinor !== undefined) values.amountMinor = patch.amountMinor
  if (patch.currency !== undefined) values.currency = patch.currency
  if (patch.cycleUnit !== undefined) values.cycleUnit = patch.cycleUnit
  if (patch.cycleCount !== undefined) values.cycleCount = patch.cycleCount
  if (patch.nextArrival !== undefined) values.nextArrival = patch.nextArrival

  if (Object.keys(values).length === 0) {
    return getIncomeSource(db, userId, id)
  }

  const rows = await db
    .update(incomeSource)
    .set(values)
    .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId)))
    .returning()

  return rows[0] ?? null
}

/** Paused: the source keeps its history but stops paying in projections. */
export async function archiveIncomeSource(
  db: Database,
  userId: string,
  id: string,
): Promise<IncomeSource | null> {
  const rows = await db
    .update(incomeSource)
    .set({ archivedAt: new Date() })
    .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function restoreIncomeSource(
  db: Database,
  userId: string,
  id: string,
): Promise<IncomeSource | null> {
  const rows = await db
    .update(incomeSource)
    .set({ archivedAt: null })
    .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId)))
    .returning()

  return rows[0] ?? null
}

/** Real delete — nothing references a source, so there is nothing to guard. */
export async function deleteIncomeSource(
  db: Database,
  userId: string,
  id: string,
): Promise<IncomeSource | null> {
  const rows = await db
    .delete(incomeSource)
    .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId)))
    .returning()

  return rows[0] ?? null
}

/** Every real arrival in [from, to], across the given sources. */
export function arrivalsBetween(
  sources: IncomeSource[],
  from: Date,
  to: Date,
): IncomeArrival[] {
  const arrivals: IncomeArrival[] = []

  for (const source of sources) {
    for (const date of occurrencesBetween(
      source.nextArrival,
      sourceCycle(source),
      from,
      to,
    )) {
      arrivals.push({ source, date })
    }
  }

  return arrivals
}

/**
 * The budget view of arrivals in a period. A source that lands inside the
 * period contributes its arrivals; one with no arrival — a quarterly pay in an
 * off-month, say — carries its most recent pay instead, because that money is
 * what funds the period. A source that has not started yet contributes
 * nothing.
 */
export function periodArrivals(
  sources: IncomeSource[],
  from: Date,
  to: Date,
): IncomeArrival[] {
  const arrivals: IncomeArrival[] = []

  for (const source of sources) {
    const inPeriod = arrivalsBetween([source], from, to)
    if (inPeriod.length > 0) {
      arrivals.push(...inPeriod)
      continue
    }

    const carried = previousOccurrence(
      source.nextArrival,
      sourceCycle(source),
      from,
    )
    if (carried) {
      arrivals.push({ source, date: carried })
    }
  }

  return arrivals
}
