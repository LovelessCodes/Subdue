import { describe, expect, it } from 'vitest'
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from '@/server/services/categories'
import { createTestDb, insertTestUser } from '@/test/db'

describe('categories service', () => {
  it('lists only categories owned by the user', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    await createCategory(db, 'u1', { name: 'Insurance', color: '#f00' })
    await createCategory(db, 'u2', { name: 'Software' })

    const list = await listCategories(db, 'u1', { limit: 50, offset: 0 })

    expect(list.total).toBe(1)
    expect(list.items).toHaveLength(1)
    expect(list.items[0]?.name).toBe('Insurance')
  })

  it('updates and deletes only owned categories', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createCategory(db, 'u1', { name: 'Utilities' })
    expect(created).not.toBeNull()
    const id = created!.id

    const stolen = await updateCategory(db, 'u2', id, { name: 'Hijacked' })
    expect(stolen).toBeNull()

    const updated = await updateCategory(db, 'u1', id, { name: 'Bills' })
    expect(updated?.name).toBe('Bills')

    expect(await deleteCategory(db, 'u2', id)).toBe(false)
    expect(await deleteCategory(db, 'u1', id)).toBe(true)

    expect(await getCategory(db, 'u1', id)).toBeNull()
  })

  it('paginates deterministically by name', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    for (const name of ['Beta', 'Alpha', 'Gamma']) {
      await createCategory(db, 'u1', { name })
    }

    const firstPage = await listCategories(db, 'u1', { limit: 2, offset: 0 })
    const secondPage = await listCategories(db, 'u1', { limit: 2, offset: 2 })

    expect(firstPage.items.map((c) => c.name)).toEqual(['Alpha', 'Beta'])
    expect(firstPage.total).toBe(3)
    expect(secondPage.items.map((c) => c.name)).toEqual(['Gamma'])
  })
})
