import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  consumeSetupToken,
  ensureSetupToken,
  getSetupToken,
  setupTokenPath,
} from '@/lib/setup-token'

describe('setup token', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frist-setup-'))
    process.env.DATA_DIR = dir
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.DATA_DIR
  })

  it('generates once, persists and is reusable across boots', () => {
    const token = ensureSetupToken(false)
    expect(token).toHaveLength(32)
    expect(ensureSetupToken(false)).toBe(token)
    expect(getSetupToken()).toBe(token)
  })

  it('consumes the token exactly once', () => {
    ensureSetupToken(false)
    consumeSetupToken()
    expect(getSetupToken()).toBeNull()
    expect(() => statSync(setupTokenPath())).toThrow()
  })

  it('cleans up any token once an administrator exists', () => {
    ensureSetupToken(false)
    expect(ensureSetupToken(true)).toBeNull()
    expect(getSetupToken()).toBeNull()
  })
})
