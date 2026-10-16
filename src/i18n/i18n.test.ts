import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { createTranslator } from 'use-intl/core'
import {
  SUPPORTED_LOCALES,
  matchLocale,
  pickFromAcceptLanguage,
  resolveMessageLocale,
} from './index'
import type { MessageLocale } from './index'

const dir = new URL('./messages/', import.meta.url)
const catalogFiles = readdirSync(dir).sort()

type Catalog = Record<string, Record<string, string>>

function load(file: string): Catalog {
  return JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as Catalog
}

/**
 * The argument names a message expects — both plain ({amount}) and ICU
 * ({count, plural…}) ones. Plural branch text (one {…}, other {…}) is
 * stripped first so literal words are never mistaken for arguments.
 */
function placeholders(message: string): string[] {
  const skeleton = message.replace(
    /\b(?:zero|one|two|few|many|other|=?\d+)\s*\{[^{}]*\}/g,
    '',
  )
  return [...skeleton.matchAll(/\{(\w+)(?=[,}])/g)]
    .map((match) => match[1] ?? '')
    .sort()
}

describe('messages', () => {
  it('ships one catalog per supported locale', () => {
    expect(catalogFiles).toEqual(
      SUPPORTED_LOCALES.map((locale) => `${locale}.json`).sort(),
    )
  })

  it('keeps every catalog on the same keys as English', () => {
    const reference = load('en.json')
    const namespaces = Object.keys(reference).sort()
    expect(namespaces.length).toBeGreaterThan(0)

    for (const file of catalogFiles) {
      const catalog = load(file)
      expect(Object.keys(catalog).sort(), file).toEqual(namespaces)
      for (const namespace of namespaces) {
        const entries = catalog[namespace] ?? {}
        const expected = reference[namespace] ?? {}
        expect(Object.keys(entries).sort(), `${file}: ${namespace}`).toEqual(
          Object.keys(expected).sort(),
        )
        for (const [key, value] of Object.entries(entries)) {
          const where = `${file}: ${namespace}.${key}`
          expect(typeof value, where).toBe('string')
          expect(value.length, where).toBeGreaterThan(0)
          expect(placeholders(value), where).toEqual(
            placeholders(expected[key] ?? ''),
          )
        }
      }
    }
  })

  it('renders every message in every catalog', () => {
    for (const file of catalogFiles) {
      const catalog = load(file)
      const translator = createTranslator({
        locale: file.replace(/\.json$/, '') as MessageLocale,
        messages: catalog,
      })
      const t = translator as (
        key: string,
        values?: Record<string, string | number>,
      ) => string

      for (const [namespace, entries] of Object.entries(catalog)) {
        for (const [key, message] of Object.entries(entries)) {
          const where = `${file}: ${namespace}.${key}`
          // Two counts so both plural branches are exercised.
          for (const count of [1, 5]) {
            const values = Object.fromEntries(
              placeholders(message).map((name) => [
                name,
                name === 'count' ? count : 'x',
              ]),
            )
            expect(
              t(`${namespace}.${key}`, values).length,
              where,
            ).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})

describe('locale matching', () => {
  it('matches a region tag to its primary language', () => {
    expect(matchLocale('da-DK')).toBe('da')
    expect(matchLocale('zh-CN')).toBe('zh')
    expect(matchLocale('uk_UA')).toBe('uk')
    expect(matchLocale('fi')).toBe('fi')
    expect(matchLocale('nl-BE')).toBe('nl')
    expect(matchLocale('ja')).toBeNull()
    expect(matchLocale(null)).toBeNull()
  })

  it('resolves unsupported or empty values to English', () => {
    expect(resolveMessageLocale('ja')).toBe('en')
    expect(resolveMessageLocale('')).toBe('en')
  })

  it('picks the best supported language from Accept-Language', () => {
    expect(pickFromAcceptLanguage('da-DK,da;q=0.9,en;q=0.8')).toBe('da')
    expect(pickFromAcceptLanguage('ja,da;q=0.9')).toBe('da')
    expect(pickFromAcceptLanguage('de')).toBe('de')
    expect(pickFromAcceptLanguage('*')).toBe('en')
    expect(pickFromAcceptLanguage(null)).toBe('en')
  })
})
