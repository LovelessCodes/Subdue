import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders, setCookie } from '@tanstack/react-start/server'
import { and, eq } from 'drizzle-orm'
import * as z from 'zod'
import { subscriptionMember, user } from '../lib/auth-schema'
import { socialProviderIds } from '../lib/social-providers'
import { envConfiguredProviderIds } from '../lib/social-config'
import { getBudgetStatus } from '../server/services/budget'
import { getCalendarMonth } from '../server/services/calendar'
import * as categories from '../server/services/categories'
import * as channels from '../server/services/channels'
import * as deliveries from '../server/services/deliveries'
import { seedDefaults } from '../server/services/defaults'
import * as setupService from '../server/services/setup'
import * as socialAuth from '../server/services/social-auth'
import { getDashboardSummary } from '../server/services/dashboard'
import * as ical from '../server/services/ical'
import * as incomeSources from '../server/services/income-sources'
import * as paymentMethods from '../server/services/payment-methods'
import {
  inboxSummary,
  listNotifications,
  markNotificationsRead,
  maybeRunReminders,
  unreadCount,
} from '../server/services/reminders'
import {
  getOnboardedAt,
  getSettings,
  updateSettings,
} from '../server/services/settings'
import * as subscriptions from '../server/services/subscriptions'
import * as sharing from '../server/services/sharing'
import {
  categoryBodySchema,
  categoryPatchSchema,
  channelBodySchema,
  channelPatchSchema,
  checkSubscriptionReferences,
  incomeSourceBodySchema,
  incomeSourcePatchSchema,
  memberBodySchema,
  memberPatchSchema,
  memberReminderSchema,
  onboardingBodySchema,
  paymentMethodBodySchema,
  paymentMethodPatchSchema,
  reorderIdsSchema,
  settingsPatchSchema,
  socialProviderUpdateSchema,
  subscriptionBodySchema,
} from '../server/validation'
import { removeLogo } from '../server/logos'
import { LOCALE_COOKIE } from '../i18n'
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
  const summary = await inboxSummary(db, userId, items)
  return { items, unread, summary }
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
    if (
      patch.price !== undefined &&
      !(await sharing.priceCoversShares(db, id, patch.price))
    ) {
      throw new Error('SHARES_EXCEED_PRICE')
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

/** The owner's split panel for one subscription. */
export const getSubscriptionSplit = createServerFn({ method: 'GET' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const owned = await subscriptions.getSubscription(db, userId, data.id)
    if (!owned) {
      throw new Error('SUBSCRIPTION_NOT_FOUND')
    }
    const members = await sharing.listMembers(db, data.id)
    return { subscription: owned, members: members.map(sharing.memberView) }
  })

export const addSplitMember = createServerFn({ method: 'POST' })
  .validator((input: unknown) => memberBodySchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const created = await sharing.createMember(
      db,
      userId,
      data.subscriptionId,
      {
        displayName: data.displayName,
        email: data.email ?? null,
        shareMinor: data.shareMinor,
      },
    )
    if (typeof created === 'string') {
      throw new Error(created)
    }
    return sharing.memberView(created)
  })

export const updateSplitMember = createServerFn({ method: 'POST' })
  .validator((input: unknown) => memberPatchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...patch } = data
    const updated = await sharing.updateMember(db, userId, id, patch)
    if (typeof updated === 'string') {
      throw new Error(updated)
    }
    return sharing.memberView(updated)
  })

/** Also deletes that member's notifications for the subscription. */
export const removeSplitMember = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const removed = await sharing.deleteMember(db, userId, data.id)
    if (!removed) {
      throw new Error('MEMBER_NOT_FOUND')
    }
    return { success: true }
  })

/** Mints a link; the token is returned once and only its hash is stored. */
export const createSplitInvite = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const invite = await sharing.mintInvite(db, userId, data.id)
    if (typeof invite === 'string') {
      throw new Error(invite)
    }
    return invite
  })

export const revokeSplitInvite = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const revoked = await sharing.revokeInvite(db, userId, data.id)
    if (!revoked) {
      throw new Error('MEMBER_NOT_FOUND')
    }
    return { success: true }
  })

/** Public: what the invited person sees behind `/share/<token>`. */
export const getSharedInvite = createServerFn({ method: 'GET' })
  .validator((input: { token: string }) => ({
    token: z.string().trim().max(200).parse(input.token),
  }))
  .handler(async ({ data }) => {
    const invite = await sharing.inviteByToken(db, data.token)
    if (!invite) {
      return { status: 'invalid' as const }
    }

    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    let viewer: 'anonymous' | 'ready' | 'member' = 'anonymous'
    if (session) {
      const existing = await db
        .select({ id: subscriptionMember.id })
        .from(subscriptionMember)
        .where(
          and(
            eq(subscriptionMember.subscriptionId, invite.subscription.id),
            eq(subscriptionMember.userId, session.user.id),
          ),
        )
        .limit(1)
      viewer = existing.length > 0 ? 'member' : 'ready'
    }

    return {
      status: 'valid' as const,
      viewer,
      ownerName: invite.ownerName,
      shareMinor: invite.member.shareMinor,
      expiresAt: invite.member.inviteExpiresAt,
      subscription: invite.subscription,
    }
  })

export const acceptSharedInvite = createServerFn({ method: 'POST' })
  .validator((input: { token: string }) => ({
    token: z.string().trim().max(200).parse(input.token),
  }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const accepted = await sharing.acceptInvite(db, userId, data.token)
    if (typeof accepted === 'string') {
      throw new Error(accepted)
    }
    return accepted
  })

export const setSharedReminder = createServerFn({ method: 'POST' })
  .validator((input: unknown) => memberReminderSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const updated = await sharing.setMemberReminder(
      db,
      userId,
      data.id,
      data.enabled,
    )
    if (!updated) {
      throw new Error('MEMBER_NOT_FOUND')
    }
    return { success: true }
  })

export const leaveSharedSubscription = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const left = await sharing.leaveSubscription(db, userId, data.id)
    if (!left) {
      throw new Error('MEMBER_NOT_FOUND')
    }
    return { success: true }
  })

export const listMyCategories = createServerFn({ method: 'GET' })
  .validator((input: { includeArchived?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const page = await categories.listCategories(db, userId, {
      limit: 100,
      offset: 0,
      includeArchived: data.includeArchived === true,
    })
    return page.items
  })

export const createMyCategory = createServerFn({ method: 'POST' })
  .validator((input: unknown) => categoryBodySchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const created = await categories.createCategory(db, userId, data)
    if (!created) {
      throw new Error('CATEGORY_CREATE_FAILED')
    }
    return created
  })

export const updateMyCategory = createServerFn({ method: 'POST' })
  .validator((input: unknown) => categoryPatchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...patch } = data
    const updated = await categories.updateCategory(db, userId, id, patch)
    if (!updated) {
      throw new Error('CATEGORY_NOT_FOUND')
    }
    return updated
  })

export const archiveMyCategory = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const archived = await categories.archiveCategory(db, userId, data.id)
    if (!archived) {
      throw new Error('CATEGORY_NOT_FOUND')
    }
    return archived
  })

export const restoreMyCategory = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const restored = await categories.restoreCategory(db, userId, data.id)
    if (!restored) {
      throw new Error('CATEGORY_NOT_FOUND')
    }
    return restored
  })

export const reorderMyCategories = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reorderIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const reordered = await categories.reorderCategories(db, userId, data.ids)
    if (!reordered) {
      throw new Error('CATEGORY_IDS_INVALID')
    }
    return { success: true }
  })

/** Reports `in-use` with the reference count instead of deleting. */
export const purgeMyCategory = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const result = await categories.purgeCategory(db, userId, data.id)
    if (result.status === 'not-found') {
      throw new Error('CATEGORY_NOT_FOUND')
    }
    return result
  })

export const listMyIncomeSources = createServerFn({ method: 'GET' })
  .validator((input: { includeArchived?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const now = new Date()
    const items = await incomeSources.listIncomeSources(db, userId, {
      includeArchived: data.includeArchived === true,
    })
    return items.map((source) => ({
      ...source,
      nextPayday: incomeSources.nextArrival(source, now),
    }))
  })

export const createMyIncomeSource = createServerFn({ method: 'POST' })
  .validator((input: unknown) => incomeSourceBodySchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const settings = await getSettings(db, userId)
    const created = await incomeSources.createIncomeSource(db, userId, {
      ...data,
      currency: data.currency ?? settings.currency,
    })
    if (!created) {
      throw new Error('INCOME_SOURCE_CREATE_FAILED')
    }
    return created
  })

export const updateMyIncomeSource = createServerFn({ method: 'POST' })
  .validator((input: unknown) => incomeSourcePatchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...patch } = data
    const updated = await incomeSources.updateIncomeSource(
      db,
      userId,
      id,
      patch,
    )
    if (!updated) {
      throw new Error('INCOME_SOURCE_NOT_FOUND')
    }
    return updated
  })

export const archiveMyIncomeSource = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const archived = await incomeSources.archiveIncomeSource(
      db,
      userId,
      data.id,
    )
    if (!archived) {
      throw new Error('INCOME_SOURCE_NOT_FOUND')
    }
    return archived
  })

export const restoreMyIncomeSource = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const restored = await incomeSources.restoreIncomeSource(
      db,
      userId,
      data.id,
    )
    if (!restored) {
      throw new Error('INCOME_SOURCE_NOT_FOUND')
    }
    return restored
  })

export const deleteMyIncomeSource = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const deleted = await incomeSources.deleteIncomeSource(db, userId, data.id)
    if (!deleted) {
      throw new Error('INCOME_SOURCE_NOT_FOUND')
    }
    return { success: true }
  })

export const listMyPaymentMethods = createServerFn({ method: 'GET' })
  .validator((input: { includeArchived?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const page = await paymentMethods.listPaymentMethods(db, userId, {
      limit: 100,
      offset: 0,
      includeArchived: data.includeArchived === true,
    })
    return page.items
  })

export const createMyPaymentMethod = createServerFn({ method: 'POST' })
  .validator((input: unknown) => paymentMethodBodySchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const created = await paymentMethods.createPaymentMethod(db, userId, data)
    if (!created) {
      throw new Error('PAYMENT_METHOD_CREATE_FAILED')
    }
    return created
  })

export const updateMyPaymentMethod = createServerFn({ method: 'POST' })
  .validator((input: unknown) => paymentMethodPatchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...patch } = data
    const updated = await paymentMethods.updatePaymentMethod(
      db,
      userId,
      id,
      patch,
    )
    if (!updated) {
      throw new Error('PAYMENT_METHOD_NOT_FOUND')
    }
    return updated
  })

export const archiveMyPaymentMethod = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const archived = await paymentMethods.archivePaymentMethod(
      db,
      userId,
      data.id,
    )
    if (!archived) {
      throw new Error('PAYMENT_METHOD_NOT_FOUND')
    }
    return archived
  })

export const restoreMyPaymentMethod = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const restored = await paymentMethods.restorePaymentMethod(
      db,
      userId,
      data.id,
    )
    if (!restored) {
      throw new Error('PAYMENT_METHOD_NOT_FOUND')
    }
    return restored
  })

export const reorderMyPaymentMethods = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reorderIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const reordered = await paymentMethods.reorderPaymentMethods(
      db,
      userId,
      data.ids,
    )
    if (!reordered) {
      throw new Error('PAYMENT_METHOD_IDS_INVALID')
    }
    return { success: true }
  })

/** Reports `in-use` with the reference count instead of deleting. */
export const purgeMyPaymentMethod = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const result = await paymentMethods.purgePaymentMethod(db, userId, data.id)
    if (result.status === 'not-found') {
      throw new Error('PAYMENT_METHOD_NOT_FOUND')
    }
    return result
  })

/** Runs once: stamps the locale and, unless skipped, the seed rows. */
export const completeOnboarding = createServerFn({ method: 'POST' })
  .validator((input: unknown) => onboardingBodySchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    return seedDefaults(db, userId, data.locale, { seed: data.seed })
  })

/** Drives the welcome redirect: false until onboarding is completed or skipped. */
export const getOnboardingStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return { onboarded: (await getOnboardedAt(db, userId)) !== null }
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
    if (data.locale) {
      // Mirror the choice so signed-out pages keep this browser's language.
      setCookie(LOCALE_COOKIE, data.locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        httpOnly: true,
      })
    }
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
          title: 'Frist test notification',
          body: `This is a test from Frist. If you can read this, "${target.name}" works.`,
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
