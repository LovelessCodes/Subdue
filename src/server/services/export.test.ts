import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SqliteDatabase from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createCategory } from '@/server/services/categories'
import {
  createBackup,
  exportBundle,
  exportSubscriptionsCsv,
} from '@/server/services/export'
import { createSubscription } from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

async function seed() {
  const { db } = createTestDb()
  await insertTestUser(db, 'u1')

  const domainCategory = await createCategory(db, 'u1', { name: 'Domains' })
  await createCategory(db, 'u1', { name: 'Unused' })

  await createSubscription(db, 'u1', {
    name: 'Loveless.codes',
    price: 63340,
    currency: 'DKK',
    cycleUnit: 'years',
    cycleCount: 1,
    nextPayment: new Date('2026-10-30T00:00:00.000Z'),
    categoryId: domainCategory?.id ?? null,
    notes: 'renews end of October',
  })

  return db
}

describe('export', () => {
  it('exports a versioned bundle with resolved names', async () => {
    const db = await seed()
    const bundle = await exportBundle(db, 'u1')

    expect(bundle.app).toBe('subdue')
    expect(bundle.version).toBe(1)
    expect(bundle.categories.map((item) => item.name)).toEqual([
      'Domains',
      'Unused',
    ])
    expect(bundle.subscriptions).toHaveLength(1)
    expect(bundle.subscriptions[0]).toMatchObject({
      name: 'Loveless.codes',
      priceMinor: 63340,
      currency: 'DKK',
      cycleUnit: 'years',
      cycleCount: 1,
      nextPayment: '2026-10-30',
      category: 'Domains',
      paymentMethod: null,
      url: null,
      notes: 'renews end of October',
      autoRenew: true,
      cancelledAt: null,
      logo: null,
    })
  })

  it('writes round-trippable CSV', async () => {
    const db = await seed()
    const csv = await exportSubscriptionsCsv(db, 'u1')
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe(
      'name,price_minor,currency,cycle_unit,cycle_count,next_payment,category,payment_method,payer,url,notes,remind_days_before,auto_renew,cancelled_at',
    )
    expect(lines[1]).toBe(
      'Loveless.codes,63340,DKK,years,1,2026-10-30,Domains,,,,renews end of October,,true,',
    )
  })

  it('creates a consistent one-file backup', async () => {
    const db = await seed()
    const dir = await mkdtemp(join(tmpdir(), 'subdue-backup-test-'))
    const path = join(dir, 'backup.db')

    try {
      createBackup(db, path)

      const copy = new SqliteDatabase(path, { readonly: true })
      const row = copy
        .prepare('SELECT COUNT(*) AS count FROM subscription')
        .get() as { count: number }
      copy.close()

      expect(row.count).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
