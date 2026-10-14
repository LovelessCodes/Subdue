import { asc, eq } from 'drizzle-orm'
import { socialProvider } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { parseSocialFieldValue } from '../../lib/social-config'
import { socialProviders, type SocialField } from '../../lib/social-providers'
import type { SocialProviderName } from '../validation'

export type SocialExtra = Record<string, string | number | boolean | string[]>

export type SocialProviderView = {
  provider: string
  clientId: string
  clientSecretSet: boolean
  enabled: boolean
  extra: SocialExtra
  createdAt: Date
  updatedAt: Date
}

function fieldsFor(provider: string): SocialField[] {
  return socialProviders.find((entry) => entry.id === provider)?.fields ?? []
}

function parseExtra(raw: string | null | undefined): SocialExtra {
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as SocialExtra
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Keeps only the fields the catalog defines for this provider, coercing string
 * inputs (comma lists, booleans, permission bits) into the shape better-auth
 * expects.
 */
export function normalizeSocialExtra(
  provider: string,
  input: SocialExtra | undefined,
): SocialExtra {
  if (!input) {
    return {}
  }

  const normalized: SocialExtra = {}
  for (const field of fieldsFor(provider)) {
    const value = input[field.key]
    if (value === undefined || value === '') {
      continue
    }
    if (typeof value === 'string') {
      const parsed = parseSocialFieldValue(field, value)
      if (typeof parsed === 'string' && parsed !== '') {
        normalized[field.key] = parsed
      } else if (typeof parsed === 'number' || typeof parsed === 'boolean') {
        normalized[field.key] = parsed
      } else if (Array.isArray(parsed) && parsed.length > 0) {
        normalized[field.key] = parsed as string[]
      }
    } else {
      normalized[field.key] = value
    }
  }
  return normalized
}

function toView(row: typeof socialProvider.$inferSelect): SocialProviderView {
  return {
    provider: row.provider,
    clientId: row.clientId,
    clientSecretSet: row.clientSecret.length > 0,
    enabled: row.enabled ?? true,
    extra: parseExtra(row.extra),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listSocialProviders(
  db: Database,
): Promise<SocialProviderView[]> {
  const rows = await db
    .select()
    .from(socialProvider)
    .orderBy(asc(socialProvider.provider))
  return rows.map(toView)
}

export type UpsertSocialProviderResult = {
  row: SocialProviderView | null
  error: string | null
}

export async function upsertSocialProvider(
  db: Database,
  input: {
    provider: SocialProviderName
    clientId: string
    clientSecret?: string
    enabled?: boolean
    extra?: SocialExtra
  },
): Promise<UpsertSocialProviderResult> {
  const existing = await db
    .select()
    .from(socialProvider)
    .where(eq(socialProvider.provider, input.provider))
    .limit(1)

  const current = existing[0]
  const enabled = input.enabled ?? current?.enabled ?? true
  const secret = input.clientSecret ?? current?.clientSecret ?? ''

  if (enabled && secret.length === 0) {
    return { row: null, error: 'SOCIAL_SECRET_REQUIRED' }
  }

  const extra =
    input.extra !== undefined
      ? normalizeSocialExtra(input.provider, input.extra)
      : parseExtra(current?.extra)
  const extraJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null
  const now = new Date()

  if (current) {
    const rows = await db
      .update(socialProvider)
      .set({
        clientId: input.clientId,
        clientSecret: secret,
        enabled,
        extra: extraJson,
        updatedAt: now,
      })
      .where(eq(socialProvider.provider, input.provider))
      .returning()
    return { row: rows[0] ? toView(rows[0]) : null, error: null }
  }

  const rows = await db
    .insert(socialProvider)
    .values({
      id: crypto.randomUUID(),
      provider: input.provider,
      clientId: input.clientId,
      clientSecret: secret,
      enabled,
      extra: extraJson,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return { row: rows[0] ? toView(rows[0]) : null, error: null }
}

export async function removeSocialProvider(
  db: Database,
  provider: SocialProviderName,
): Promise<boolean> {
  const rows = await db
    .delete(socialProvider)
    .where(eq(socialProvider.provider, provider))
    .returning({ id: socialProvider.id })
  return rows.length > 0
}
