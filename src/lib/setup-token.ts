import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './paths'

export function setupTokenPath(): string {
  return join(dataDir(), 'setup-token')
}

export function getSetupToken(): string | null {
  try {
    const token = readFileSync(setupTokenPath(), 'utf8').trim()
    return token.length >= 16 ? token : null
  } catch {
    return null
  }
}

/**
 * Ensures a claim token exists while the instance has no administrator.
 * Reading the container logs is the trust anchor for the admin role, so the
 * token is printed (and reprinted) on every boot until it is claimed.
 */
export function ensureSetupToken(hasAdmin: boolean): string | null {
  const path = setupTokenPath()

  if (hasAdmin) {
    rmSync(path, { force: true })
    return null
  }

  const existing = getSetupToken()
  if (existing) {
    return existing
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(path, `${token}\n`, { mode: 0o600 })
  return token
}

export function consumeSetupToken(): void {
  rmSync(setupTokenPath(), { force: true })
}
