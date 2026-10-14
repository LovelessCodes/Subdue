import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { categoriesPlugin } from '@/server/plugins/categories'
import type { currenciesPlugin } from '@/server/plugins/currencies'
import type { paymentMethodsPlugin } from '@/server/plugins/payment-methods'
import type { settingsPlugin } from '@/server/plugins/settings'
import type { subscriptionsPlugin } from '@/server/plugins/subscriptions'

export const categoriesClient = {
  id: 'categories',
  $InferServerPlugin: {} as ReturnType<typeof categoriesPlugin>,
} satisfies BetterAuthClientPlugin

export const currenciesClient = {
  id: 'currencies',
  $InferServerPlugin: {} as ReturnType<typeof currenciesPlugin>,
} satisfies BetterAuthClientPlugin

export const paymentMethodsClient = {
  id: 'payment-methods',
  $InferServerPlugin: {} as ReturnType<typeof paymentMethodsPlugin>,
} satisfies BetterAuthClientPlugin

export const settingsClient = {
  id: 'settings',
  $InferServerPlugin: {} as ReturnType<typeof settingsPlugin>,
} satisfies BetterAuthClientPlugin

export const subscriptionsClient = {
  id: 'subscriptions',
  $InferServerPlugin: {} as ReturnType<typeof subscriptionsPlugin>,
} satisfies BetterAuthClientPlugin
