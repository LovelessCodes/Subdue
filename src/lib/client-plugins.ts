import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { categoriesPlugin } from '@/server/plugins/categories'
import type { subscriptionsPlugin } from '@/server/plugins/subscriptions'

export const categoriesClient = {
  id: 'categories',
  $InferServerPlugin: {} as ReturnType<typeof categoriesPlugin>,
} satisfies BetterAuthClientPlugin

export const subscriptionsClient = {
  id: 'subscriptions',
  $InferServerPlugin: {} as ReturnType<typeof subscriptionsPlugin>,
} satisfies BetterAuthClientPlugin
