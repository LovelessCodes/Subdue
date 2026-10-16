import { describe, expect, it } from 'vitest'
import { archiveCategory, createCategory } from '@/server/services/categories'
import {
  createSubscription,
  deleteSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
  type SubscriptionInput,
} from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

function input(overrides: Partial<SubscriptionInput> = {}): SubscriptionInput {
  return {
    name: 'Spotify',
    price: 19900,
    currency: 'DKK',
    cycleUnit: 'months',
    cycleCount: 1,
    nextPayment: new Date('2026-11-08T00:00:00.000Z'),
    ...overrides,
  }
}

describe('subscriptions service', () => {
  it('lists sorted by next payment and filters by category', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const category = await createCategory(db, 'u1', { name: 'Music' })
    await createSubscription(db, 'u1', input({ name: 'Spotify' }))
    await createSubscription(
      db,
      'u1',
      input({
        name: 'Insurance',
        categoryId: category!.id,
        nextPayment: new Date('2026-11-01T00:00:00.000Z'),
      }),
    )

    const all = await listSubscriptions(db, 'u1', {
      limit: 50,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })
    expect(all.total).toBe(2)
    expect(all.items.map((s) => s.name)).toEqual(['Insurance', 'Spotify'])

    const filtered = await listSubscriptions(db, 'u1', {
      limit: 50,
      offset: 0,
      categoryId: category!.id,
      sort: 'name',
      order: 'asc',
    })
    expect(filtered.total).toBe(1)
    expect(filtered.items[0]?.name).toBe('Insurance')
  })

  it('enforces ownership on read, update and delete', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createSubscription(db, 'u1', input())
    const id = created!.id

    expect(await getSubscription(db, 'u2', id)).toBeNull()
    expect(await updateSubscription(db, 'u2', id, { name: 'Nope' })).toBeNull()
    expect(await deleteSubscription(db, 'u2', id)).toBe(false)

    const updated = await updateSubscription(db, 'u1', id, {
      price: 21900,
      notes: 'price raise',
    })
    expect(updated?.price).toBe(21900)
    expect(updated?.notes).toBe('price raise')

    const scopedList = await listSubscriptions(db, 'u2', {
      limit: 50,
      offset: 0,
      sort: 'created-at',
      order: 'desc',
    })
    expect(scopedList.total).toBe(0)
  })

  it('keeps the category reference when a category is archived', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const category = await createCategory(db, 'u1', { name: 'Software' })
    const created = await createSubscription(
      db,
      'u1',
      input({ name: 'OpenCode', categoryId: category!.id }),
    )

    expect(created?.categoryId).toBe(category!.id)

    await archiveCategory(db, 'u1', category!.id)

    const fetched = await getSubscription(db, 'u1', created!.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.categoryId).toBe(category!.id)
  })

  it('reports rolled next due dates', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const now = new Date('2026-10-14T12:00:00.000Z')

    const created = await createSubscription(
      db,
      'u1',
      input({ nextPayment: new Date('2026-08-01T00:00:00.000Z') }),
      now,
    )
    expect(created?.nextDue).toEqual(new Date('2026-11-01T00:00:00.000Z'))

    const list = await listSubscriptions(
      db,
      'u1',
      { limit: 50, offset: 0, sort: 'next-payment', order: 'asc' },
      now,
    )
    expect(list.items[0]?.nextDue).toEqual(new Date('2026-11-01T00:00:00.000Z'))

    const fresh = await getSubscription(db, 'u1', created!.id, now)
    expect(fresh?.nextDue).toEqual(new Date('2026-11-01T00:00:00.000Z'))
  })
})
