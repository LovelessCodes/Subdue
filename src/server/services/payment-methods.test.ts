import { describe, expect, it } from 'vitest'
import {
  archivePaymentMethod,
  createPaymentMethod,
  getPaymentMethod,
  listPaymentMethods,
  purgePaymentMethod,
  reorderPaymentMethods,
  restorePaymentMethod,
  updatePaymentMethod,
} from '@/server/services/payment-methods'
import {
  createSubscription,
  deleteSubscription,
} from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

describe('payment methods service', () => {
  it('lists in position order, scoped to the user', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    await createPaymentMethod(db, 'u1', { name: 'Visa', icon: 'visa.png' })
    await createPaymentMethod(db, 'u1', { name: 'MobilePay' })
    await createPaymentMethod(db, 'u2', { name: 'Other' })

    const list = await listPaymentMethods(db, 'u1', { limit: 50, offset: 0 })

    expect(list.total).toBe(2)
    expect(list.items.map((method) => method.name)).toEqual([
      'Visa',
      'MobilePay',
    ])
  })

  it('enforces ownership on update, archive and restore', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createPaymentMethod(db, 'u1', { name: 'Card' })
    const id = created!.id

    expect(
      await updatePaymentMethod(db, 'u2', id, { name: 'Hijacked' }),
    ).toBeNull()
    expect(await archivePaymentMethod(db, 'u2', id)).toBeNull()
    expect(await restorePaymentMethod(db, 'u2', id)).toBeNull()

    const updated = await updatePaymentMethod(db, 'u1', id, {
      name: 'Credit Card',
      icon: 'card.svg',
    })
    expect(updated?.name).toBe('Credit Card')
    expect(updated?.icon).toBe('card.svg')
  })

  it('archives, hides, restores and discloses on request', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await createPaymentMethod(db, 'u1', { name: 'Visa' })
    const id = created!.id

    const archived = await archivePaymentMethod(db, 'u1', id)
    expect(archived?.archivedAt).toBeInstanceOf(Date)
    expect((await getPaymentMethod(db, 'u1', id))?.name).toBe('Visa')

    expect(
      (await listPaymentMethods(db, 'u1', { limit: 50, offset: 0 })).total,
    ).toBe(0)
    expect(
      (
        await listPaymentMethods(db, 'u1', {
          limit: 50,
          offset: 0,
          includeArchived: true,
        })
      ).total,
    ).toBe(1)

    const restored = await restorePaymentMethod(db, 'u1', id)
    expect(restored?.archivedAt).toBeNull()
    expect(
      (await listPaymentMethods(db, 'u1', { limit: 50, offset: 0 })).total,
    ).toBe(1)
  })

  it('purges only when no subscription references the row', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await createPaymentMethod(db, 'u1', { name: 'Visa' })
    const id = created!.id

    const subscription = await createSubscription(db, 'u1', {
      name: 'Spotify',
      price: 19900,
      currency: 'DKK',
      cycleUnit: 'months',
      cycleCount: 1,
      paymentMethodId: id,
      nextPayment: new Date('2026-11-08T00:00:00.000Z'),
    })

    expect(await purgePaymentMethod(db, 'u1', id)).toEqual({
      status: 'in-use',
      references: 1,
    })
    expect(await getPaymentMethod(db, 'u1', id)).not.toBeNull()

    await deleteSubscription(db, 'u1', subscription!.id)
    expect(await purgePaymentMethod(db, 'u1', id)).toEqual({
      status: 'deleted',
    })
    expect(await getPaymentMethod(db, 'u1', id)).toBeNull()
  })

  it('reorders in a single transaction, rejecting bad lists whole', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const visa = await createPaymentMethod(db, 'u1', { name: 'Visa' })
    const mastercard = await createPaymentMethod(db, 'u1', {
      name: 'MasterCard',
    })
    const debit = await createPaymentMethod(db, 'u1', { name: 'Debit card' })

    expect(
      await reorderPaymentMethods(db, 'u1', [
        debit!.id,
        visa!.id,
        mastercard!.id,
      ]),
    ).toBe(true)

    const list = await listPaymentMethods(db, 'u1', { limit: 50, offset: 0 })
    expect(list.items.map((row) => [row.name, row.position])).toEqual([
      ['Debit card', 0],
      ['Visa', 1],
      ['MasterCard', 2],
    ])

    expect(await reorderPaymentMethods(db, 'u1', [visa!.id, 'nope'])).toBe(
      false,
    )
    expect(await reorderPaymentMethods(db, 'u1', [visa!.id, visa!.id])).toBe(
      false,
    )

    const unchanged = await listPaymentMethods(db, 'u1', {
      limit: 50,
      offset: 0,
    })
    expect(unchanged.items.map((row) => row.name)).toEqual([
      'Debit card',
      'Visa',
      'MasterCard',
    ])

    const appended = await createPaymentMethod(db, 'u1', {
      name: 'Bank transfer',
    })
    expect(appended?.position).toBe(3)
  })
})
