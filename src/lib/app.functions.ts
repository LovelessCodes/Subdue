import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import * as z from 'zod'
import { user } from '../lib/auth-schema'
import { socialProviderIds } from '../lib/social-providers'
import { envConfiguredProviderIds } from '../lib/social-config'
import { getBudgetStatus } from '../server/services/budget'
import { getCalendarMonth } from '../server/services/calendar'
import { listCategories } from '../server/services/categories'
import * as channels from '../server/services/channels'
import * as deliveries from '../server/services/deliveries'
import * as setupService from '../server/services/setup'
import * as socialAuth from '../server/services/social-auth'
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
  channelBodySchema,
  channelPatchSchema,
  checkSubscriptionReferences,
  settingsPatchSchema,
  socialProviderUpdateSchema,
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
export const listMyChannels = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const rows = await channels.listChannels(db, userId)
    return rows.map(channels.channelView)
  },
)

export const createMyChannel = createServerFn({ method: 'POST' })
  .validator((input: unknown) => channelBodySchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    let config: channels.ChannelConfig
    try {
      config = channels.parseChannelConfig(data.type, data.config)
    } catch {
      throw new Error('CHANNEL_CONFIG_INVALID')
    }
    const row = await channels.createChannel(db, userId, {
      type: data.type,
      name: data.name,
      config,
      enabled: data.enabled,
    })
    return channels.channelView(row)
  })

export const updateMyChannel = createServerFn({ method: 'POST' })
  .validator((input: unknown) => channelPatchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...patch } = data
    let row: channels.Channel | null
    try {
      row = await channels.updateChannel(db, userId, id, patch)
    } catch {
      throw new Error('CHANNEL_CONFIG_INVALID')
    }
    if (!row) {
      throw new Error('CHANNEL_NOT_FOUND')
    }
    return channels.channelView(row)
  })

export const deleteMyChannel = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const deleted = await channels.deleteChannel(db, userId, data.id)
    if (!deleted) {
      throw new Error('CHANNEL_NOT_FOUND')
    }
    return { success: true }
  })

export const testMyChannel = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const target = await channels.getChannel(db, userId, data.id)
    if (!target) {
      throw new Error('CHANNEL_NOT_FOUND')
    }
    const { senders } = await import('../server/senders')
    const type = target.type as channels.ChannelType
    const sender = senders[type]
    if (!sender) {
      return { ok: false, error: `Unknown channel type ${type}` }
    }
    try {
      await sender(
        {
          title: 'Subdue test notification',
          body: `This is a test from Subdue. If you can read this, "${target.name}" works.`,
        },
        channels.decodeChannelConfig(type, target.config),
      )
      return { ok: true, error: null }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

export const listMyDeliveries = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return deliveries.listDeliveries(db, userId, 20)
  },
)

export const getAuthProviders = createServerFn({ method: 'GET' }).handler(
  async () => {
    const providers = (auth.options.socialProviders ?? {}) as Record<
      string,
      unknown
    >
    return Object.keys(providers).filter((name) => Boolean(providers[name]))
  },
)

export const getSetupStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return setupService.getSetupStatus(db, userId)
  },
)

export const claimSetup = createServerFn({ method: 'POST' })
  .validator((input: { token: string }) => ({
    token: z.string().trim().min(1).max(200).parse(input.token),
  }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const result = await setupService.claimAdmin(db, userId, data.token)
    if (result === 'invalid-token') {
      throw new Error('SETUP_TOKEN_INVALID')
    }
    return { result }
  })

async function requireAdminUserId(): Promise<string> {
  const userId = await requireUserId()
  const rows = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (rows[0]?.role !== 'admin') {
    throw new Error('ADMIN_REQUIRED')
  }
  return userId
}

export const listSocialProviders = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdminUserId()
    const items = await socialAuth.listSocialProviders(db)
    const providers = (auth.options.socialProviders ?? {}) as Record<
      string,
      unknown
    >
    return {
      items,
      active: Object.keys(providers).filter((name) => Boolean(providers[name])),
      env: envConfiguredProviderIds(),
    }
  },
)

export const saveSocialProvider = createServerFn({ method: 'POST' })
  .validator((input: unknown) => socialProviderUpdateSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdminUserId()
    const result = await socialAuth.upsertSocialProvider(db, data)
    if (result.error) {
      throw new Error(result.error)
    }
    return result.row
  })

export const removeSocialProvider = createServerFn({ method: 'POST' })
  .validator((input: { provider: string }) => ({
    provider: z.enum(socialProviderIds).parse(input.provider),
  }))
  .handler(async ({ data }) => {
    await requireAdminUserId()
    const removed = await socialAuth.removeSocialProvider(db, data.provider)
    if (!removed) {
      throw new Error('SOCIAL_PROVIDER_NOT_FOUND')
    }
    return { success: true }
  })
