import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getBudgetStatus } from '../server/services/budget'
import { getCalendarMonth } from '../server/services/calendar'
import { getDashboardSummary } from '../server/services/dashboard'
import {
  listNotifications,
  markNotificationsRead,
  maybeRunReminders,
  unreadCount,
} from '../server/services/reminders'
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
    await maybeRunReminders(db, userId)
    return getDashboardSummary(db, userId)
  },
)

export const getBudget = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await requireUserId()
  return getBudgetStatus(db, userId)
})

export const getInbox = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await requireUserId()
  await maybeRunReminders(db, userId)
  const [items, unread] = await Promise.all([
    listNotifications(db, userId, { limit: 50 }),
    unreadCount(db, userId),
  ])
  return { items, unread }
})

export const markInboxRead = createServerFn({ method: 'POST' })
  .validator((input: { ids?: string[] }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const marked = await markNotificationsRead(db, userId, data.ids)
    return { marked, unread: await unreadCount(db, userId) }
  })

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

export const getCalendar = createServerFn({ method: 'GET' })
  .validator((input: { month?: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const now = new Date()
    let year = now.getUTCFullYear()
    let month = now.getUTCMonth() + 1

    const match = data.month?.match(/^(\d{4})-(\d{2})$/)
    if (match) {
      const parsedYear = Number(match[1])
      const parsedMonth = Number(match[2])
      if (parsedMonth >= 1 && parsedMonth <= 12) {
        year = parsedYear
        month = parsedMonth
      }
    }

    return getCalendarMonth(db, userId, { year, month })
  })
