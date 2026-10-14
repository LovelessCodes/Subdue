import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import * as z from 'zod'
import { getBudgetStatus } from '../server/services/budget'
import { getCalendarMonth } from '../server/services/calendar'
import { listCategories } from '../server/services/categories'
import { getDashboardSummary } from '../server/services/dashboard'
import * as ical from '../server/services/ical'
import { listPaymentMethods } from '../server/services/payment-methods'
import {
  listNotifications,
  markNotificationsRead,
  maybeRunReminders,
  unreadCount,
} from '../server/services/reminders'
import { getSettings, updateSettings } from '../server/services/settings'
import * as subscriptions from '../server/services/subscriptions'
import {
  checkSubscriptionReferences,
  settingsPatchSchema,
  subscriptionBodySchema,
} from '../server/validation'
import { removeLogo } from '../server/logos'
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
    const page = await subscriptions.listSubscriptions(db, userId, {
      limit: 100,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })
    return page.items
  },
)

export const createSubscription = createServerFn({ method: 'POST' })
  .validator((input: unknown) => subscriptionBodySchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const referenceError = await checkSubscriptionReferences(db, userId, data)
    if (referenceError) {
      throw new Error(referenceError)
    }
    const settings = await getSettings(db, userId)
    const created = await subscriptions.createSubscription(db, userId, {
      ...data,
      currency: data.currency ?? settings.currency,
    })
    if (!created) {
      throw new Error('SUBSCRIPTION_CREATE_FAILED')
    }
    return created
  })

export const updateSubscription = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    subscriptionBodySchema.partial().extend({ id: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...patch } = data
    const referenceError = await checkSubscriptionReferences(db, userId, patch)
    if (referenceError) {
      throw new Error(referenceError)
    }
    const existing = await subscriptions.getSubscription(db, userId, id)
    if (!existing) {
      throw new Error('SUBSCRIPTION_NOT_FOUND')
    }
    const updated = await subscriptions.updateSubscription(
      db,
      userId,
      id,
      patch,
    )
    if (!updated) {
      throw new Error('SUBSCRIPTION_NOT_FOUND')
    }
    if (
      patch.logo !== undefined &&
      existing.logo &&
      existing.logo !== updated.logo
    ) {
      removeLogo(existing.logo)
    }
    return updated
  })

export const deleteSubscription = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const existing = await subscriptions.getSubscription(db, userId, data.id)
    if (!existing) {
      throw new Error('SUBSCRIPTION_NOT_FOUND')
    }
    await subscriptions.deleteSubscription(db, userId, data.id)
    if (existing.logo) {
      removeLogo(existing.logo)
    }
    return { success: true }
  })

export const listMyCategories = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const page = await listCategories(db, userId, { limit: 100, offset: 0 })
    return page.items
  },
)

export const listMyPaymentMethods = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const page = await listPaymentMethods(db, userId, {
      limit: 100,
      offset: 0,
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

export const updateMySettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => settingsPatchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return updateSettings(db, userId, data)
  })

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

export const getIcalStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const status = await ical.getIcalStatus(db, userId)
    return {
      enabled: status.enabled,
      path: status.token ? `/api/ical/${status.token}` : null,
    }
  },
)

export const enableIcal = createServerFn({ method: 'POST' }).handler(
  async () => {
    const userId = await requireUserId()
    const { token } = await ical.enableIcal(db, userId)
    return { path: `/api/ical/${token}` }
  },
)

export const rotateIcal = createServerFn({ method: 'POST' }).handler(
  async () => {
    const userId = await requireUserId()
    const { token } = await ical.rotateIcal(db, userId)
    return { path: `/api/ical/${token}` }
  },
)

export const disableIcal = createServerFn({ method: 'POST' }).handler(
  async () => {
    const userId = await requireUserId()
    await ical.disableIcal(db, userId)
    return { success: true }
  },
)

export const listMyApiKeys = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireUserId()
    const result = await auth.api.listApiKeys({
      headers: getRequestHeaders(),
    })
    return (result.apiKeys ?? []).map((key) => ({
      id: key.id,
      name: key.name ?? null,
      start: key.start ?? null,
      createdAt: key.createdAt,
      lastRequest: key.lastRequest ?? null,
      enabled: key.enabled ?? true,
    }))
  },
)

export const createMyApiKey = createServerFn({ method: 'POST' })
  .validator((input: { name: string }) => ({
    name: z.string().trim().min(1).max(100).parse(input.name),
  }))
  .handler(async ({ data }) => {
    await requireUserId()
    const created = (await auth.api.createApiKey({
      body: { name: data.name },
      headers: getRequestHeaders(),
    })) as { id: string; key?: string; start?: string | null }
    return { id: created.id, key: created.key ?? null }
  })

export const revokeMyApiKey = createServerFn({ method: 'POST' })
  .validator((input: { keyId: string }) => input)
  .handler(async ({ data }) => {
    await requireUserId()
    await auth.api.deleteApiKey({
      body: { keyId: data.keyId },
      headers: getRequestHeaders(),
    })
    return { success: true }
  })
