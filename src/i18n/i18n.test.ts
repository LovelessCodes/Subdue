import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import {
  SUPPORTED_LOCALES,
  matchLocale,
  pickFromAcceptLanguage,
  resolveMessageLocale,
} from './index'

const dir = new URL('./messages/', import.meta.url)
const catalogFiles = readdirSync(dir).sort()

function load(file: string): { nav: Record<string, string> } {
  return JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as {
    nav: Record<string, string>
  }
}

describe('messages', () => {
  it('ships one catalog per supported locale', () => {
    expect(catalogFiles).toEqual(
      SUPPORTED_LOCALES.map((locale) => `${locale}.json`).sort(),
    )
  })

  it('keeps every catalog on the same keys as English', () => {
    const reference = Object.keys(load('en.json').nav).sort()
    expect(reference.length).toBeGreaterThan(0)

    for (const file of catalogFiles) {
      const entries = load(file).nav
      expect(Object.keys(entries).sort(), file).toEqual(reference)
      for (const [key, value] of Object.entries(entries)) {
        expect(typeof value, `${file}: ${key}`).toBe('string')
        expect(value.length, `${file}: ${key}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('locale matching', () => {
  it('matches a region tag to its primary language', () => {
    expect(matchLocale('da-DK')).toBe('da')
    expect(matchLocale('zh-CN')).toBe('zh')
    expect(matchLocale('uk_UA')).toBe('uk')
    expect(matchLocale('fi')).toBeNull()
    expect(matchLocale(null)).toBeNull()
  })

  it('resolves unsupported or empty values to English', () => {
    expect(resolveMessageLocale('fi')).toBe('en')
    expect(resolveMessageLocale('')).toBe('en')
  })

  it('picks the best supported language from Accept-Language', () => {
    expect(pickFromAcceptLanguage('da-DK,da;q=0.9,en;q=0.8')).toBe('da')
    expect(pickFromAcceptLanguage('fi,da;q=0.9')).toBe('da')
    expect(pickFromAcceptLanguage('de')).toBe('de')
    expect(pickFromAcceptLanguage('*')).toBe('en')
    expect(pickFromAcceptLanguage(null)).toBe('en')
  })
})
