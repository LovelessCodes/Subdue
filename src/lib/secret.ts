import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dataDir } from './paths'

const PLACEHOLDER_SECRET = 'change-me'

/**
 * Resolves the auth secret without requiring configuration:
 * - an explicit BETTER_AUTH_SECRET wins (the .env.example placeholder does not)
 * - otherwise a secret is generated once and stored next to the database, so
 *   sessions and tokens survive restarts; deleting it resets them.
 */
export function resolveAuthSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim()
  if (fromEnv && fromEnv !== PLACEHOLDER_SECRET) {
    return fromEnv
  }

  const secretPath = join(dataDir(), 'secret')

  try {
    const existing = readFileSync(secretPath, 'utf8').trim()
    if (existing.length >= 32) {
      return existing
    }
  } catch {
    // first boot: fall through and generate one
  }

  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const secret = Buffer.from(bytes).toString('base64')
  mkdirSync(dirname(secretPath), { recursive: true })
  writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 })
  console.warn(
    `[Frist] Generated an auth secret at ${secretPath}. Keep it with the database — without it, sessions and tokens reset.`,
  )
  return secret
}
