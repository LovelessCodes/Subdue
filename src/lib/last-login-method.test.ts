import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('last login method', () => {
  let dir: string
  let authApi: (typeof import('@/lib/auth'))['auth']['api']

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'frist-last-method-'))
    process.env.DATABASE_PATH = join(dir, 'auth.db')
    const { auth } = await import('@/lib/auth')
    authApi = auth.api
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('records email as the last used method on sign-in', async () => {
    await authApi.signUpEmail({
      body: {
        email: 'last@example.com',
        password: 'password123',
        name: 'Last',
      },
    })

    const signIn = await authApi.signInEmail({
      body: { email: 'last@example.com', password: 'password123' },
      returnHeaders: true,
    })

    const cookie = signIn.headers
      .getSetCookie()
      .find((value) => value.startsWith('better-auth.last_used_login_method'))

    expect(cookie).toBeTruthy()
    expect(cookie).toContain('email')
  })
})
