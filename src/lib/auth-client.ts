import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { categoriesClient, subscriptionsClient } from './client-plugins'

export const authClient = createAuthClient({
  plugins: [adminClient(), categoriesClient, subscriptionsClient],
})
