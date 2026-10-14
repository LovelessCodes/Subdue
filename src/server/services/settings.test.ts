import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  getSettings,
  updateSettings,
} from '@/server/services/settings'
import { createTestDb, insertTestUser } from '@/test/db'

describe('settings service', () => {
  it('returns defaults when the user has no settings row', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    expect(await getSettings(db, 'u1')).toEqual(defaultSettings)
  })

  it('creates a settings row on first update and patches it after', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await updateSettings(db, 'u1', {
      currency: 'EUR',
      theme: 'dark',
    })
    expect(created).toEqual({
      currency: 'EUR',
      locale: defaultSettings.locale,
      weekStart: defaultSettings.weekStart,
      theme: 'dark',
      budgetAmountMinor: null,
      payAnchorDay: null,
    })

    const patched = await updateSettings(db, 'u1', { locale: 'da' })
    expect(patched.locale).toBe('da')
    expect(patched.currency).toBe('EUR')
    expect(patched.theme).toBe('dark')
  })

  it('keeps settings isolated per user', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    await updateSettings(db, 'u1', { currency: 'USD' })

    expect((await getSettings(db, 'u2')).currency).toBe(
      defaultSettings.currency,
    )
    expect((await getSettings(db, 'u1')).currency).toBe('USD')
  })
})
