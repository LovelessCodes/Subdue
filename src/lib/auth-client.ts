import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import {
  categoriesClient,
  channelsClient,
  currenciesClient,
  notificationsClient,
  paymentMethodsClient,
  settingsClient,
  subscriptionsClient,
} from './client-plugins'

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    categoriesClient,
    channelsClient,
    currenciesClient,
    notificationsClient,
    paymentMethodsClient,
    settingsClient,
    subscriptionsClient,
  ],
})
