import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getDashboardSummary } from '../server/services/dashboard'
import { getSettings } from '../server/services/settings'
import { listSubscriptions } from '../server/services/subscriptions'
import { auth } from './auth'
import { db } from './db'

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session.user.id
}

export const getDashboard = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return getDashboardSummary(db, userId)
  },
)

export const listMySubscriptions = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const page = await listSubscriptions(db, userId, {
      limit: 100,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })
    return page.items
  },
)

export const getMySettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return getSettings(db, userId)
  },
)
