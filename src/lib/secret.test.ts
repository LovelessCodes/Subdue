import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveAuthSecret } from '@/lib/secret'

const originalSecret = process.env.BETTER_AUTH_SECRET
const originalDatabase = process.env.DATABASE_PATH

describe('auth secret resolution', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frist-secret-'))
    process.env.DATABASE_PATH = join(dir, 'frist.db')
    delete process.env.BETTER_AUTH_SECRET
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET
    } else {
      process.env.BETTER_AUTH_SECRET = originalSecret
    }
    if (originalDatabase === undefined) {
      delete process.env.DATABASE_PATH
    } else {
      process.env.DATABASE_PATH = originalDatabase
    }
  })

  it('generates a secret beside the database and reuses it', () => {
    const first = resolveAuthSecret()
    expect(first).toHaveLength(44)

    const second = resolveAuthSecret()
    expect(second).toBe(first)
    expect(readFileSync(join(dir, 'secret'), 'utf8').trim()).toBe(first)
  })

  it('prefers an explicit env secret', () => {
    process.env.BETTER_AUTH_SECRET = 'explicit-secret-explicit-secret-1234'
    expect(resolveAuthSecret()).toBe('explicit-secret-explicit-secret-1234')
  })

  it('treats the .env.example placeholder as unset', () => {
    process.env.BETTER_AUTH_SECRET = 'change-me'
    const generated = resolveAuthSecret()
    expect(generated).not.toBe('change-me')
    expect(generated).toHaveLength(44)
  })
})
