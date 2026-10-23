import { apiKey } from '@better-auth/api-key'
import { passkey } from '@better-auth/passkey'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { mcp } from '@better-auth/mcp'
import { betterAuth } from 'better-auth'
import { lastLoginMethod, openAPI } from 'better-auth/plugins'
import { admin } from 'better-auth/plugins/admin'
import { jwt } from 'better-auth/plugins/jwt'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { categoriesPlugin } from '../server/plugins/categories'
import { channelsPlugin } from '../server/plugins/channels'
import { currenciesPlugin } from '../server/plugins/currencies'
import { dashboardPlugin } from '../server/plugins/dashboard'
import { icalPlugin } from '../server/plugins/ical'
import { incomeSourcesPlugin } from '../server/plugins/income-sources'
import { notificationsPlugin } from '../server/plugins/notifications'
import { paymentMethodsPlugin } from '../server/plugins/payment-methods'
import { settingsPlugin } from '../server/plugins/settings'
import { socialPlugin } from '../server/plugins/social'
import { subscriptionsPlugin } from '../server/plugins/subscriptions'
import * as schema from './auth-schema'
import { db, sqlite } from './db'
import { resolveAuthSecret } from './secret'
import { loadSocialProvidersFromEnv } from './social-config'

const envBaseUrl = process.env.BETTER_AUTH_URL?.trim()
const envTrustedOrigins = process.env.TRUSTED_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/**
 * Social providers come from two places: environment variables (deployment
 * configuration, and the winner when both exist) and the administrator's
 * database rows. Raw SQL keeps schema generation working before the table
 * exists.
 */
function loadSocialProvidersFromDatabase(): Record<
  string,
  Record<string, unknown>
> {
  try {
    const rows = sqlite
      .prepare(
        'SELECT provider, client_id AS clientId, client_secret AS clientSecret, extra FROM social_provider WHERE enabled = 1',
      )
      .all() as {
      provider: string
      clientId: string
      clientSecret: string
      extra: string | null
    }[]

    const providers: Record<string, Record<string, unknown>> = {}
    for (const row of rows) {
      if (!row.clientId || !row.clientSecret) {
        continue
      }
      let extra: Record<string, unknown> = {}
      try {
        extra = row.extra
          ? (JSON.parse(row.extra) as Record<string, unknown>)
          : {}
      } catch {
        extra = {}
      }
      providers[row.provider] = {
        ...extra,
        clientId: row.clientId,
        clientSecret: row.clientSecret,
      }
    }
    return providers
  } catch {
    // first boot before migrations, or schema generation: no providers yet
    return {}
  }
}

const socialProvidersConfig: Record<string, Record<string, unknown>> = {
  ...loadSocialProvidersFromDatabase(),
  ...loadSocialProvidersFromEnv(),
}

export const mcpResource =
  process.env.MCP_RESOURCE_URL?.trim() ||
  (envBaseUrl
    ? `${envBaseUrl.replace(/\/+$/, '')}/api/mcp`
    : 'http://localhost:3000/api/mcp')

export const auth = betterAuth({
  appName: 'Frist',
  secret: resolveAuthSecret(),
  // Explicit when configured; otherwise every request's host is used, with
  // '*' allowing any of them (self-hosted instances get reached by many names).
  baseURL: envBaseUrl
    ? envBaseUrl
    : {
        allowedHosts: ['*'],
        // Direct auth.api calls without a request (tests, scripts) have no
        // host to resolve; fall back instead of throwing.
        fallback: 'http://localhost:3000',
      },
  // Self-hosted default: any origin. Narrow via TRUSTED_ORIGINS when the
  // instance is reachable beyond your own network.
  trustedOrigins:
    envTrustedOrigins && envTrustedOrigins.length > 0
      ? envTrustedOrigins
      : ['*'],
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      joins: true,
    },
  },
  socialProviders: socialProvidersConfig as Parameters<
    typeof betterAuth
  >[0]['socialProviders'],
  plugins: [
    admin(),
    apiKey({
      // API keys act as full sessions so scripts can call the same REST
      // endpoints the browser does. Keys are per-user and revocable; the
      // rate limit keeps a leaked key from hammering the instance.
      enableSessionForAPIKeys: true,
      rateLimit: {
        enabled: true,
        timeWindow: 60 * 60 * 1000,
        maxRequests: 600,
      },
    }),
    jwt({
      // Signing keys stay usable if the secret changes; in a self-hosted
      // single-file setup the database itself is the sensitive artifact.
      jwks: { disablePrivateKeyEncryption: true },
    }),
    lastLoginMethod(),
    openAPI(),
    passkey({
      // WebAuthn binds a passkey to one domain, and the plugin's default is
      // 'localhost' when baseURL is dynamic. Set PASSKEY_RP_ID to the hostname
      // you actually browse (see the README's Passkeys section).
      ...(process.env.PASSKEY_RP_ID?.trim()
        ? { rpID: process.env.PASSKEY_RP_ID.trim() }
        : {}),
    }),
    twoFactor({
      issuer: 'Frist',
    }),
    categoriesPlugin(),
    channelsPlugin(),
    currenciesPlugin(),
    dashboardPlugin(),
    icalPlugin(),
    incomeSourcesPlugin(),
    notificationsPlugin(),
    paymentMethodsPlugin(),
    settingsPlugin(),
    socialPlugin(),
    subscriptionsPlugin(),
    mcp({
      loginPage: '/sign-in',
      consentPage: '/consent',
      resource: mcpResource,
      scopes: ['openid', 'profile', 'offline_access', 'mcp:read'],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: 'infer',
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: 'mcp-2026-07-28',
    }),
    tanstackStartCookies(),
  ],
})
