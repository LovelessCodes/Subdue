import { apiKey } from '@better-auth/api-key'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { mcp } from '@better-auth/mcp'
import { betterAuth } from 'better-auth'
import { openAPI } from 'better-auth/plugins'
import { admin } from 'better-auth/plugins/admin'
import { jwt } from 'better-auth/plugins/jwt'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { categoriesPlugin } from '../server/plugins/categories'
import { channelsPlugin } from '../server/plugins/channels'
import { currenciesPlugin } from '../server/plugins/currencies'
import { dashboardPlugin } from '../server/plugins/dashboard'
import { icalPlugin } from '../server/plugins/ical'
import { notificationsPlugin } from '../server/plugins/notifications'
import { paymentMethodsPlugin } from '../server/plugins/payment-methods'
import { settingsPlugin } from '../server/plugins/settings'
import { subscriptionsPlugin } from '../server/plugins/subscriptions'
import * as schema from './auth-schema'
import { db, sqlite } from './db'
import { resolveAuthSecret } from './secret'

const envBaseUrl = process.env.BETTER_AUTH_URL?.trim()
const envTrustedOrigins = process.env.TRUSTED_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const mcpResource =
  process.env.MCP_RESOURCE_URL?.trim() ||
  (envBaseUrl
    ? `${envBaseUrl.replace(/\/+$/, '')}/api/mcp`
    : 'http://localhost:3000/api/mcp')

export const auth = betterAuth({
  appName: 'Subdue',
  secret: resolveAuthSecret(),
  // Explicit when configured; otherwise every request's host is used, with
  // '*' allowing any of them (self-hosted instances get reached by many names).
  baseURL: envBaseUrl ? envBaseUrl : { allowedHosts: ['*'] },
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
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const row = sqlite
            .prepare('SELECT COUNT(*) AS count FROM user')
            .get() as { count: number }
          if (row.count === 0) {
            return { data: { ...user, role: 'admin' } }
          }
          return { data: user }
        },
      },
    },
  },
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
    jwt(),
    openAPI(),
    categoriesPlugin(),
    channelsPlugin(),
    currenciesPlugin(),
    dashboardPlugin(),
    icalPlugin(),
    notificationsPlugin(),
    paymentMethodsPlugin(),
    settingsPlugin(),
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
