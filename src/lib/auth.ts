import { apiKey } from '@better-auth/api-key'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { openAPI } from 'better-auth/plugins'
import { admin } from 'better-auth/plugins/admin'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { categoriesPlugin } from '../server/plugins/categories'
import { subscriptionsPlugin } from '../server/plugins/subscriptions'
import * as schema from './auth-schema'
import { db, sqlite } from './db'

export const auth = betterAuth({
  appName: 'Subdue',
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
    apiKey(),
    openAPI(),
    categoriesPlugin(),
    subscriptionsPlugin(),
    tanstackStartCookies(),
  ],
})
