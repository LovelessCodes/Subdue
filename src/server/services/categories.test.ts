import { describe, expect, it } from 'vitest'
import {
  archiveCategory,
  createCategory,
  getCategory,
  listCategories,
  purgeCategory,
  reorderCategories,
  restoreCategory,
  updateCategory,
} from '@/server/services/categories'
import {
  createSubscription,
  deleteSubscription,
} from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

describe('categories service', () => {
  it('lists only categories owned by the user, in position order', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    await createCategory(db, 'u1', { name: 'Utilities' })
    await createCategory(db, 'u1', { name: 'Insurance', color: '#f00' })
    await createCategory(db, 'u2', { name: 'Software' })

    const list = await listCategories(db, 'u1', { limit: 50, offset: 0 })

    expect(list.total).toBe(2)
    expect(list.items.map((category) => category.name)).toEqual([
      'Utilities',
      'Insurance',
    ])
    expect(list.items.map((category) => category.position)).toEqual([0, 1])
  })

  it('paginates in position order', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    for (const name of ['Beta', 'Alpha', 'Gamma']) {
      await createCategory(db, 'u1', { name })
    }

    const firstPage = await listCategories(db, 'u1', { limit: 2, offset: 0 })
    const secondPage = await listCategories(db, 'u1', { limit: 2, offset: 2 })

    expect(firstPage.items.map((category) => category.name)).toEqual([
      'Beta',
      'Alpha',
    ])
    expect(firstPage.total).toBe(3)
    expect(secondPage.items.map((category) => category.name)).toEqual(['Gamma'])
  })

  it('updates and archives only owned categories', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createCategory(db, 'u1', { name: 'Utilities' })
    const id = created!.id

    expect(await updateCategory(db, 'u2', id, { name: 'Hijacked' })).toBeNull()
    expect((await updateCategory(db, 'u1', id, { name: 'Bills' }))?.name).toBe(
      'Bills',
    )
    expect(await archiveCategory(db, 'u2', id)).toBeNull()
  })

  it('archives, hides, restores and discloses on request', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await createCategory(db, 'u1', { name: 'Insurance' })
    const id = created!.id

    const archived = await archiveCategory(db, 'u1', id)
    expect(archived?.archivedAt).toBeInstanceOf(Date)

    // Still reachable by id — that is what keeps subscriptions resolving.
    expect((await getCategory(db, 'u1', id))?.name).toBe('Insurance')

    const visible = await listCategories(db, 'u1', { limit: 50, offset: 0 })
    expect(visible.total).toBe(0)

    const everything = await listCategories(db, 'u1', {
      limit: 50,
      offset: 0,
      includeArchived: true,
    })
    expect(everything.total).toBe(1)

    const restored = await restoreCategory(db, 'u1', id)
    expect(restored?.archivedAt).toBeNull()
    expect(
      (await listCategories(db, 'u1', { limit: 50, offset: 0 })).total,
    ).toBe(1)
  })

  it('purges only when no subscription references the row', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createCategory(db, 'u1', { name: 'Software' })
    const id = created!.id

    const subscription = await createSubscription(db, 'u1', {
      name: 'OpenCode',
      price: 1500,
      currency: 'EUR',
      cycleUnit: 'months',
      cycleCount: 1,
      categoryId: id,
      nextPayment: new Date('2026-11-01T00:00:00.000Z'),
    })

    expect(await purgeCategory(db, 'u2', id)).toEqual({ status: 'not-found' })
    expect(await purgeCategory(db, 'u1', id)).toEqual({
      status: 'in-use',
      references: 1,
    })
    expect(await getCategory(db, 'u1', id)).not.toBeNull()

    await deleteSubscription(db, 'u1', subscription!.id)

    expect(await purgeCategory(db, 'u1', id)).toEqual({ status: 'deleted' })
    expect(await getCategory(db, 'u1', id)).toBeNull()
    expect(await purgeCategory(db, 'u1', id)).toEqual({ status: 'not-found' })
  })

  it('reorders every row in one transaction, rejecting bad lists whole', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const a = await createCategory(db, 'u1', { name: 'A' })
    const b = await createCategory(db, 'u1', { name: 'B' })
    const c = await createCategory(db, 'u1', { name: 'C' })

    expect(await reorderCategories(db, 'u1', [c!.id, a!.id, b!.id])).toBe(true)

    const list = await listCategories(db, 'u1', { limit: 50, offset: 0 })
    expect(list.items.map((row) => [row.name, row.position])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2],
    ])

    // An id that is not the user's, or a repeat, rejects the whole call.
    expect(await reorderCategories(db, 'u1', [a!.id, 'nope'])).toBe(false)
    expect(await reorderCategories(db, 'u2', [a!.id])).toBe(false)
    expect(await reorderCategories(db, 'u1', [a!.id, a!.id])).toBe(false)

    const unchanged = await listCategories(db, 'u1', { limit: 50, offset: 0 })
    expect(unchanged.items.map((row) => row.name)).toEqual(['C', 'A', 'B'])
  })

  it('keeps unordered rows behind the ordered ones and appends new rows last', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const a = await createCategory(db, 'u1', { name: 'A' })
    const b = await createCategory(db, 'u1', { name: 'B' })
    const c = await createCategory(db, 'u1', { name: 'C' })

    await archiveCategory(db, 'u1', c!.id)
    // The caller only saw A and B; C keeps its relative order after them.
    expect(await reorderCategories(db, 'u1', [b!.id, a!.id])).toBe(true)

    const list = await listCategories(db, 'u1', {
      limit: 50,
      offset: 0,
      includeArchived: true,
    })
    expect(list.items.map((row) => [row.name, row.position])).toEqual([
      ['B', 0],
      ['A', 1],
      ['C', 2],
    ])

    // A new row lands after everything, archived rows included.
    const appended = await createCategory(db, 'u1', { name: 'D' })
    expect(appended?.position).toBe(3)
  })
})
