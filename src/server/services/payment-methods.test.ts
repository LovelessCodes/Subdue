import { describe, expect, it } from 'vitest'
import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from '@/server/services/payment-methods'
import { createTestDb, insertTestUser } from '@/test/db'

describe('payment methods service', () => {
  it('lists payment methods alphabetically, scoped to the user', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    await createPaymentMethod(db, 'u1', { name: 'Visa', icon: 'visa.png' })
    await createPaymentMethod(db, 'u1', { name: 'MobilePay' })
    await createPaymentMethod(db, 'u2', { name: 'Other' })

    const list = await listPaymentMethods(db, 'u1', { limit: 50, offset: 0 })

    expect(list.total).toBe(2)
    expect(list.items.map((method) => method.name)).toEqual([
      'MobilePay',
      'Visa',
    ])
  })

  it('enforces ownership on update and delete', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createPaymentMethod(db, 'u1', { name: 'Card' })
    const id = created!.id

    expect(
      await updatePaymentMethod(db, 'u2', id, { name: 'Hijacked' }),
    ).toBeNull()

    const updated = await updatePaymentMethod(db, 'u1', id, {
      name: 'Credit Card',
      icon: 'card.svg',
    })
    expect(updated?.name).toBe('Credit Card')
    expect(updated?.icon).toBe('card.svg')

    expect(await deletePaymentMethod(db, 'u2', id)).toBe(false)
    expect(await deletePaymentMethod(db, 'u1', id)).toBe(true)
  })
})
