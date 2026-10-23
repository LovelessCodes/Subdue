import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectImageExtension,
  logoFilePath,
  removeLogo,
  saveImportedLogo,
  saveLogo,
} from '@/server/logos'
import { isExternalLogo, logoUrl } from '@/lib/logo-source'

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])
const TEXT = new TextEncoder().encode('hello')

describe('logos', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frist-logo-'))
    process.env.DATA_DIR = dir
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.DATA_DIR
  })

  it('detects image types by signature', () => {
    expect(detectImageExtension(PNG)).toBe('png')
    expect(detectImageExtension(JPEG)).toBe('jpg')
    expect(detectImageExtension(TEXT)).toBeNull()
  })

  it('stores uploads under the data dir and removes them', () => {
    const file = saveLogo(PNG, 'png')

    expect(file.endsWith('.png')).toBe(true)
    expect(readdirSync(join(dir, 'logos'))).toContain(file)
    expect(logoFilePath(file)).toBe(join(dir, 'logos', file))

    removeLogo(file)
    expect(readdirSync(join(dir, 'logos'))).not.toContain(file)
  })

  it('sanitizes imported file names and rejects non-images', () => {
    expect(saveImportedLogo('weird name!.png', PNG)).toBe('weird_name_.png')
    expect(saveImportedLogo('notes.txt', TEXT)).toBeNull()
  })

  it('refuses path traversal names', () => {
    expect(logoFilePath('../secret')).toBeNull()
    expect(logoFilePath('nested/file.png')).toBeNull()
  })
})

describe('logo sources', () => {
  it('passes external URLs and own assets through, file names through the logos route', () => {
    expect(logoUrl('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    )
    expect(logoUrl('/brands/visa.svg')).toBe('/brands/visa.svg')
    expect(logoUrl('abc-123.png')).toBe('/api/logos/abc-123.png')
    expect(isExternalLogo('https://x.test/y.png')).toBe(true)
    expect(isExternalLogo('/brands/visa.svg')).toBe(true)
    expect(isExternalLogo('local.png')).toBe(false)
  })
})
