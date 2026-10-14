import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('passkeys', () => {
  let dir: string
  let authApi: (typeof import('@/lib/auth'))['auth']['api']
  let sqlite: (typeof import('@/lib/db'))['sqlite']

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'subdue-passkey-'))
    process.env.DATABASE_PATH = join(dir, 'auth.db')
    const { auth } = await import('@/lib/auth')
    authApi = auth.api
    ;({ sqlite } = await import('@/lib/db'))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('ships the passkey table and starts every account with none', async () => {
    const table = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'passkey'",
      )
      .get()
    expect(table).toBeTruthy()

    const signUp = await authApi.signUpEmail({
      body: {
        email: 'passkey@example.com',
        password: 'password123',
        name: 'Passkey',
      },
      returnHeaders: true,
    })
    const cookies = signUp.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .filter(Boolean)
    const headers = new Headers({ cookie: cookies.join('; ') })

    const passkeys = await authApi.listPasskeys({ headers })
    expect(passkeys).toEqual([])
  })
})
