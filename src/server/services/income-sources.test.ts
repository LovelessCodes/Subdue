import { describe, expect, it } from 'vitest'
import {
  archiveIncomeSource,
  arrivalsBetween,
  createIncomeSource,
  deleteIncomeSource,
  getIncomeSource,
  listIncomeSources,
  periodArrivals,
  restoreIncomeSource,
  updateIncomeSource,
} from '@/server/services/income-sources'
import { createTestDb, insertTestUser } from '@/test/db'

const source = {
  name: 'Full-time job',
  amountMinor: 2450000,
  currency: 'DKK',
  cycleUnit: 'months' as const,
  cycleCount: 1,
  nextArrival: new Date('2026-09-25T00:00:00.000Z'),
}

describe('income sources: crud', () => {
  it('creates, reads back and updates a source', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await createIncomeSource(db, 'u1', source)
    expect(created).not.toBeNull()
    expect(created?.archivedAt).toBeNull()

    const fetched = await getIncomeSource(db, 'u1', created!.id)
    expect(fetched?.name).toBe('Full-time job')

    const updated = await updateIncomeSource(db, 'u1', created!.id, {
      amountMinor: 2500000,
      cycleUnit: 'weeks',
      cycleCount: 2,
    })
    expect(updated?.amountMinor).toBe(2500000)
    expect(updated?.cycleUnit).toBe('weeks')
    expect(updated?.cycleCount).toBe(2)
  })

  it('scopes every read to its owner', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createIncomeSource(db, 'u1', source)
    expect(await getIncomeSource(db, 'u2', created!.id)).toBeNull()
    expect(
      await updateIncomeSource(db, 'u2', created!.id, { name: 'X' }),
    ).toBeNull()
    expect(await listIncomeSources(db, 'u2')).toEqual([])
  })

  it('archives and restores without losing the row', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await createIncomeSource(db, 'u1', source)
    await archiveIncomeSource(db, 'u1', created!.id)

    expect(await listIncomeSources(db, 'u1')).toEqual([])
    const all = await listIncomeSources(db, 'u1', { includeArchived: true })
    expect(all).toHaveLength(1)

    await restoreIncomeSource(db, 'u1', created!.id)
    expect(await listIncomeSources(db, 'u1')).toHaveLength(1)
  })

  it('deletes for good', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await createIncomeSource(db, 'u1', source)
    const deleted = await deleteIncomeSource(db, 'u1', created!.id)
    expect(deleted?.id).toBe(created!.id)
    expect(await listIncomeSources(db, 'u1')).toEqual([])
  })
})

describe('income sources: arrivals', () => {
  it('lists every arrival inside a window', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const [monthly, fortnightly] = await Promise.all([
      createIncomeSource(db, 'u1', source),
      createIncomeSource(db, 'u1', {
        name: 'Part-time job',
        amountMinor: 450000,
        currency: 'DKK',
        cycleUnit: 'weeks',
        cycleCount: 2,
        nextArrival: new Date('2026-09-18T00:00:00.000Z'),
      }),
    ])

    const arrivals = arrivalsBetween(
      [monthly!, fortnightly!],
      new Date('2026-09-25T00:00:00.000Z'),
      new Date('2026-10-24T00:00:00.000Z'),
    )

    expect(
      arrivals.map((arrival) => [
        arrival.source.name,
        arrival.date.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['Full-time job', '2026-09-25'],
      ['Part-time job', '2026-10-02'],
      ['Part-time job', '2026-10-16'],
    ])
  })

  it('carries the last pay into periods with no arrival', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const quarterly = await createIncomeSource(db, 'u1', {
      name: 'Quarterly bonus',
      amountMinor: 900000,
      currency: 'DKK',
      cycleUnit: 'months',
      cycleCount: 3,
      nextArrival: new Date('2026-07-10T00:00:00.000Z'),
    })

    const inPayMonth = periodArrivals(
      [quarterly!],
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    )
    expect(
      inPayMonth.map((arrival) => arrival.date.toISOString().slice(0, 10)),
    ).toEqual(['2026-07-10'])

    const offMonth = periodArrivals(
      [quarterly!],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    )
    expect(
      offMonth.map((arrival) => arrival.date.toISOString().slice(0, 10)),
    ).toEqual(['2026-07-10'])
  })

  it('contributes nothing before a source has started', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const future = await createIncomeSource(db, 'u1', {
      ...source,
      nextArrival: new Date('2027-01-25T00:00:00.000Z'),
    })

    const arrivals = periodArrivals(
      [future!],
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-31T00:00:00.000Z'),
    )
    expect(arrivals).toEqual([])
  })
})
