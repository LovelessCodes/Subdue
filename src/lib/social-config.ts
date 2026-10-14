import { socialProviders, type SocialField } from './social-providers'

export type SocialProviderConfig = Record<string, unknown>

export function socialEnvPrefix(providerId: string): string {
  return providerId.toUpperCase()
}

export function parseSocialFieldValue(
  field: SocialField,
  raw: string,
): unknown {
  const value = raw.trim()
  switch (field.kind) {
    case 'boolean':
      return value === 'true' || value === '1'
    case 'text-list':
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    case 'number-list':
      return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item))
        .reduce((combined, item) => combined | item, 0)
    default:
      return value
  }
}

/**
 * Reads `${PROVIDER}_CLIENT_ID` / `${PROVIDER}_CLIENT_SECRET` plus the
 * per-provider extras from the catalog, e.g. MICROSOFT_TENANT_ID or
 * COGNITO_REGION. A provider needs both a client id and a secret to count as
 * configured; environment configuration takes precedence over the admin UI.
 */
export function loadSocialProvidersFromEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, SocialProviderConfig> {
  const configured: Record<string, SocialProviderConfig> = {}

  for (const provider of socialProviders) {
    const prefix = socialEnvPrefix(provider.id)
    const clientId = env[`${prefix}_CLIENT_ID`]?.trim()
    const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim()
    if (!clientId || !clientSecret) {
      continue
    }

    const config: SocialProviderConfig = { clientId, clientSecret }
    for (const field of provider.fields) {
      const raw = env[`${prefix}_${field.envKey}`]
      if (raw !== undefined && raw.trim() !== '') {
        config[field.key] = parseSocialFieldValue(field, raw)
      }
    }
    configured[provider.id] = config
  }

  return configured
}

export function envConfiguredProviderIds(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return Object.keys(loadSocialProvidersFromEnv(env))
}
