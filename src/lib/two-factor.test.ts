import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

function base32Decode(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(char)
    if (index === -1) {
      continue
    }
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

/** RFC 6238 TOTP, 6 digits / 30s — the same thing an authenticator app runs. */
function totp(secret: string, time: number = Date.now()): string {
  const counter = Math.floor(time / 1000 / 30)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', base32Decode(secret))
    .update(buffer)
    .digest()
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f
  const code =
    ((((digest[offset] ?? 0) & 0x7f) << 24) |
      ((digest[offset + 1] ?? 0) << 16) |
      ((digest[offset + 2] ?? 0) << 8) |
      (digest[offset + 3] ?? 0)) %
    1_000_000
  return String(code).padStart(6, '0')
}

describe('two-factor integration', () => {
  let dir: string
  let authApi: (typeof import('@/lib/auth'))['auth']['api']

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'frist-2fa-'))
    process.env.DATABASE_PATH = join(dir, 'auth.db')
    const { auth } = await import('@/lib/auth')
    authApi = auth.api
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function cookieHeaders(responseHeaders: Headers): Headers {
    const cookies = responseHeaders
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .filter(Boolean)
    return new Headers({ cookie: cookies.join('; ') })
  }

  it('enables TOTP with a real code and gates the next sign-in', async () => {
    const signUp = await authApi.signUpEmail({
      body: { email: 'two@example.com', password: 'password123', name: 'Two' },
      returnHeaders: true,
    })
    const headers = cookieHeaders(signUp.headers)

    const enable = (await authApi.enableTwoFactor({
      body: { password: 'password123' },
      headers,
    })) as { totpURI: string; backupCodes: string[] }

    expect(enable.totpURI).toContain('otpauth://')
    expect(enable.backupCodes.length).toBeGreaterThan(0)

    const secret = new URL(enable.totpURI).searchParams.get('secret')
    expect(secret).toBeTruthy()

    const before = await authApi.getSession({ headers })
    expect(
      (before?.user as { twoFactorEnabled?: boolean } | undefined)
        ?.twoFactorEnabled,
    ).toBeFalsy()

    const verified = await authApi.verifyTOTP({
      body: { code: totp(secret ?? '') },
      headers,
      returnHeaders: true,
    })
    // Verification signs the user in again, rotating the session cookie.
    const sessionHeaders = verified.headers.getSetCookie().length
      ? cookieHeaders(verified.headers)
      : headers

    const after = await authApi.getSession({ headers: sessionHeaders })
    expect(
      (after?.user as { twoFactorEnabled?: boolean } | undefined)
        ?.twoFactorEnabled,
    ).toBe(true)

    const signIn = await authApi.signInEmail({
      body: { email: 'two@example.com', password: 'password123' },
      returnHeaders: true,
    })
    expect(
      (signIn.response as { twoFactorRedirect?: boolean } | null)
        ?.twoFactorRedirect,
    ).toBe(true)
  })
})
