import { describe, expect, it } from 'vitest'
import {
  checkSubscriptionReferences,
  subscriptionBodySchema,
} from '@/server/validation'
import { createPaymentMethod } from '@/server/services/payment-methods'
import { createTestDb, insertTestUser } from '@/test/db'

const validInput = {
  name: 'Spotify',
  price: 19900,
  cycleUnit: 'months',
  cycleCount: 1,
  nextPayment: '2026-11-08T00:00:00.000Z',
}

describe('subscription validation', () => {
  it('normalizes an empty url to null and rejects other schemes', () => {
    const empty = subscriptionBodySchema.parse({ ...validInput, url: '' })
    expect(empty.url).toBeNull()

    const good = subscriptionBodySchema.parse({
      ...validInput,
      url: 'https://example.com/manage',
    })
    expect(good.url).toBe('https://example.com/manage')

    expect(() =>
      subscriptionBodySchema.parse({ ...validInput, url: 'ftp://example.com' }),
    ).toThrow(/http/)
  })

  it('parses the full field set', () => {
    const parsed = subscriptionBodySchema.parse({
      ...validInput,
      url: 'https://example.com',
      autoRenew: false,
      cancelledAt: '2026-12-01T00:00:00.000Z',
      remindDaysBefore: 7,
      logo: 'abc.png',
    })

    expect(parsed.autoRenew).toBe(false)
    expect(parsed.cancelledAt).toEqual(new Date('2026-12-01T00:00:00.000Z'))
    expect(parsed.remindDaysBefore).toBe(7)
  })

  it('flags unknown payment methods and missing logos', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    expect(
      await checkSubscriptionReferences(db, 'u1', {
        paymentMethodId: 'missing',
      }),
    ).toBe('PAYMENT_METHOD_NOT_FOUND')
    expect(
      await checkSubscriptionReferences(db, 'u1', { logo: 'nope.png' }),
    ).toBe('LOGO_NOT_FOUND')

    const method = await createPaymentMethod(db, 'u1', { name: 'Card' })
    expect(
      await checkSubscriptionReferences(db, 'u1', {
        paymentMethodId: method!.id,
      }),
    ).toBeNull()
  })
})
