import { asc, eq } from 'drizzle-orm'
import { socialProvider } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import type { SocialProviderName } from '../validation'

export type SocialProviderView = {
  provider: string
  clientId: string
  clientSecretSet: boolean
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

function toView(row: typeof socialProvider.$inferSelect): SocialProviderView {
  return {
    provider: row.provider,
    clientId: row.clientId,
    clientSecretSet: row.clientSecret.length > 0,
    enabled: row.enabled ?? true,
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

  const now = new Date()

  if (current) {
    const rows = await db
      .update(socialProvider)
      .set({
        clientId: input.clientId,
        clientSecret: secret,
        enabled,
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
