import {
  adminClient,
  lastLoginMethodClient,
  twoFactorClient,
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import {
  categoriesClient,
  channelsClient,
  currenciesClient,
  icalClient,
  notificationsClient,
  paymentMethodsClient,
  settingsClient,
  subscriptionsClient,
} from './client-plugins'

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Social sign-ins and client-plugin flows land here when the account
        // has two-factor enabled; the email flow forwards explicitly.
        window.location.href = '/two-factor'
      },
    }),
    lastLoginMethodClient(),
    categoriesClient,
    channelsClient,
    currenciesClient,
    icalClient,
    notificationsClient,
    paymentMethodsClient,
    settingsClient,
    subscriptionsClient,
  ],
})
