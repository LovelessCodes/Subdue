import { describe, expect, it } from 'vitest'
import {
  listSocialProviders,
  removeSocialProvider,
  upsertSocialProvider,
} from '@/server/services/social-auth'
import { createTestDb } from '@/test/db'

describe('social provider config', () => {
  it('creates a provider without ever returning the secret', async () => {
    const { db } = createTestDb()

    const created = await upsertSocialProvider(db, {
      provider: 'google',
      clientId: 'client-123',
      clientSecret: 'secret-456',
    })

    expect(created.error).toBeNull()
    expect(created.row).toMatchObject({
      provider: 'google',
      clientId: 'client-123',
      clientSecretSet: true,
      enabled: true,
    })
    expect(created.row && 'clientSecret' in created.row).toBe(false)

    const items = await listSocialProviders(db)
    expect(items).toHaveLength(1)
    expect(items[0]?.clientSecretSet).toBe(true)
  })

  it('keeps the existing secret when an update omits it', async () => {
    const { db } = createTestDb()
    await upsertSocialProvider(db, {
      provider: 'github',
      clientId: 'old-id',
      clientSecret: 'kept-secret',
    })

    const updated = await upsertSocialProvider(db, {
      provider: 'github',
      clientId: 'new-id',
    })

    expect(updated.row?.clientId).toBe('new-id')
    expect(updated.row?.clientSecretSet).toBe(true)
  })

  it('refuses to enable a provider without any secret', async () => {
    const { db } = createTestDb()

    const result = await upsertSocialProvider(db, {
      provider: 'discord',
      clientId: 'client-only',
      enabled: true,
    })

    expect(result.error).toBe('SOCIAL_SECRET_REQUIRED')
    expect(result.row).toBeNull()
    expect(await listSocialProviders(db)).toHaveLength(0)
  })

  it('removes a provider once and reports the second attempt', async () => {
    const { db } = createTestDb()
    await upsertSocialProvider(db, {
      provider: 'microsoft',
      clientId: 'id',
      clientSecret: 'secret',
    })

    expect(await removeSocialProvider(db, 'microsoft')).toBe(true)
    expect(await removeSocialProvider(db, 'microsoft')).toBe(false)
  })
})
