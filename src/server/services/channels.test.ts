import { describe, expect, it } from 'vitest'
import {
  createChannel,
  decodeChannelConfig,
  deleteChannel,
  listChannels,
  parseChannelConfig,
  updateChannel,
} from '@/server/services/channels'
import { createTestDb, insertTestUser } from '@/test/db'

describe('channel config', () => {
  it('fills sensible defaults and rejects bad input', () => {
    const email = parseChannelConfig('email', {
      host: 'smtp.example.com',
      from: 'subdue@example.com',
      to: 'me@example.com',
    })
    expect(email.port).toBe(587)
    expect(email.secure).toBe(false)

    const ntfy = parseChannelConfig('ntfy', { topic: 'subs' })
    expect(ntfy.server).toBe('https://ntfy.sh')

    expect(() =>
      parseChannelConfig('discord', { webhookUrl: 'not-a-url' }),
    ).toThrow()
    expect(() => parseChannelConfig('ntfy', {})).toThrow()
  })
})

describe('channels service', () => {
  it('creates, updates and deletes, scoped to the owner', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const created = await createChannel(db, 'u1', {
      type: 'webhook',
      name: 'Hook',
      config: { url: 'https://example.com/hook' },
    })
    expect(created.enabled).toBe(true)
    expect(decodeChannelConfig('webhook', created.config)).toEqual({
      url: 'https://example.com/hook',
    })

    expect(await listChannels(db, 'u2')).toHaveLength(0)
    expect(
      await updateChannel(db, 'u2', created.id, { name: 'Nope' }),
    ).toBeNull()

    const updated = await updateChannel(db, 'u1', created.id, {
      name: 'Renamed',
      enabled: false,
    })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.enabled).toBe(false)

    expect(await deleteChannel(db, 'u2', created.id)).toBe(false)
    expect(await deleteChannel(db, 'u1', created.id)).toBe(true)
    expect(await listChannels(db, 'u1')).toHaveLength(0)
  })

  it('rejects config that does not fit the channel type', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const created = await createChannel(db, 'u1', {
      type: 'ntfy',
      name: 'Ntfy',
      config: { server: 'https://ntfy.sh', topic: 'x' },
    })

    await expect(
      updateChannel(db, 'u1', created.id, { config: { topic: '' } }),
    ).rejects.toThrow()
  })
})
