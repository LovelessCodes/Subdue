import en from './messages/en.json'

/** English is the source of truth for message keys. */
export type Messages = typeof en
export const DEFAULT_LOCALE = 'en' as const

export const SUPPORTED_LOCALES = [
  'en',
  'da',
  'de',
  'sv',
  'nb',
  'fr',
  'es',
  'zh',
  'uk',
] as const
export type MessageLocale = (typeof SUPPORTED_LOCALES)[number]

/** Mirrors the language choice for signed-out pages on the same browser. */
export const LOCALE_COOKIE = 'subdue-locale'

const loaders: Record<MessageLocale, () => Promise<{ default: unknown }>> = {
  en: () => import('./messages/en.json'),
  da: () => import('./messages/da.json'),
  de: () => import('./messages/de.json'),
  sv: () => import('./messages/sv.json'),
  nb: () => import('./messages/nb.json'),
  fr: () => import('./messages/fr.json'),
  es: () => import('./messages/es.json'),
  zh: () => import('./messages/zh.json'),
  uk: () => import('./messages/uk.json'),
}

export async function loadMessages(locale: MessageLocale): Promise<Messages> {
  const module = await loaders[locale]()
  return module.default as Messages
}

/**
 * The catalog for a language tag like `da` or `da-DK`, or null when we ship
 * no catalog for it. Region variants fall back to their primary language.
 */
export function matchLocale(
  tag: string | null | undefined,
): MessageLocale | null {
  if (!tag) return null
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return (SUPPORTED_LOCALES as readonly string[]).includes(primary)
    ? (primary as MessageLocale)
    : null
}

/** A stored preference or request tag resolved to a catalog we ship. */
export function resolveMessageLocale(
  tag: string | null | undefined,
): MessageLocale {
  return matchLocale(tag) ?? DEFAULT_LOCALE
}

/** The best supported language an Accept-Language header asks for. */
export function pickFromAcceptLanguage(
  header: string | null | undefined,
): MessageLocale {
  if (!header) return DEFAULT_LOCALE

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';')
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='))
      const q = quality ? Number(quality.slice(2)) : 1
      return { tag, q: Number.isFinite(q) ? q : 0 }
    })
    .sort((a, b) => b.q - a.q)

  for (const entry of ranked) {
    const match = matchLocale(entry.tag)
    if (match) return match
  }
  return DEFAULT_LOCALE
}

declare module 'use-intl' {
  interface AppConfig {
    Locale: MessageLocale
    Messages: Messages
  }
}
