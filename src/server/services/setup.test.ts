import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureSetupToken, getSetupToken } from '@/lib/setup-token'
import { claimAdmin, getSetupStatus } from '@/server/services/setup'
import { createTestDb, insertTestUser } from '@/test/db'

describe('admin claim', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frist-claim-'))
    process.env.DATA_DIR = dir
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.DATA_DIR
  })

  it('rejects a wrong token and leaves the user unprivileged', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    ensureSetupToken(false)

    expect(await claimAdmin(db, 'u1', 'not-the-token')).toBe('invalid-token')
    const status = await getSetupStatus(db, 'u1')
    expect(status.isAdmin).toBe(false)
    expect(status.hasAdmin).toBe(false)
    expect(status.hasToken).toBe(true)
  })

  it('promotes the claimant and consumes the token', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    const token = ensureSetupToken(false)!

    expect(await claimAdmin(db, 'u1', token)).toBe('claimed')

    const status = await getSetupStatus(db, 'u1')
    expect(status.isAdmin).toBe(true)
    expect(status.hasAdmin).toBe(true)
    expect(status.hasToken).toBe(false)
    expect(getSetupToken()).toBeNull()

    expect(await claimAdmin(db, 'u1', token)).toBe('invalid-token')
  })

  it('treats a second claimant as untrusted once the token is gone', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')
    const token = ensureSetupToken(false)!

    expect(await claimAdmin(db, 'u1', token)).toBe('claimed')
    expect(await claimAdmin(db, 'u2', token)).toBe('invalid-token')
    expect((await getSetupStatus(db, 'u2')).isAdmin).toBe(false)
  })
})
