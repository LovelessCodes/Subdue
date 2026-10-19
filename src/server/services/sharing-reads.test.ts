import { describe, expect, it } from 'vitest'
import { getBudgetStatus } from '@/server/services/budget'
import { getDashboardSummary } from '@/server/services/dashboard'
import { exportBundle } from '@/server/services/export'
import { buildUserIcalFeed } from '@/server/services/ical'
import { createPaymentMethod } from '@/server/services/payment-methods'
import {
  inboxSummary,
  listNotifications,
  runDueReminders,
} from '@/server/services/reminders'
import {
  createSubscription,
  listSubscriptions,
} from '@/server/services/subscriptions'
import {
  acceptInvite,
  createMember,
  mintInvite,
  priceCoversShares,
  setMemberReminder,
} from '@/server/services/sharing'
import { createTestDb, insertTestUser } from '@/test/db'

const now = new Date('2026-10-24T12:00:00.000Z')

const ratesPayload = {
  base: 'EUR',
  date: '2026-10-24',
  rates: { DKK: 7.46 },
}

function fakeFetch(payload: unknown) {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })
  return { fetchFn }
}

/** Owner pays DKK 239; friend accepted a DKK 59.75 split. */
async function setup() {
  const { db } = createTestDb()
  await insertTestUser(db, 'owner')
  await insertTestUser(db, 'friend')

  const method = await createPaymentMethod(db, 'owner', {
    name: 'Visa •••• 4242',
  })
  const subscription = await createSubscription(
    db,
    'owner',
    {
      name: 'YouTube Premium Family',
      price: 23_900,
      currency: 'DKK',
      cycleUnit: 'months',
      cycleCount: 1,
      nextPayment: new Date('2026-10-26T00:00:00.000Z'),
      notes: 'Family plan password: hunter2',
      payer: 'Mikkel',
      paymentMethodId: method!.id,
    },
    now,
  )
  if (!subscription) throw new Error('setup failed')

  const member = await createMember(db, 'owner', subscription.id, {
    displayName: 'Jonas',
    shareMinor: 5_975,
  })
  if (typeof member === 'string') throw new Error('setup failed')

  return { db, subscription, memberId: member.id }
}

async function accepted() {
  const context = await setup()
  const invite = await mintInvite(context.db, 'owner', context.memberId, now)
  if (typeof invite === 'string') throw new Error('mint failed')
  await acceptInvite(context.db, 'friend', invite.token, now)
  return context
}

describe('shared reads: the viewer-aware list', () => {
  it('hides a split until the invite is accepted', async () => {
    const { db } = await setup()
    const page = await listSubscriptions(db, 'friend', {
      limit: 50,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })
    expect(page.total).toBe(0)
    expect(page.items).toHaveLength(0)
  })

  it('shows the share as the price and redacts the owner’s private fields', async () => {
    const { db, subscription } = await accepted()

    const page = await listSubscriptions(db, 'friend', {
      limit: 50,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })

    expect(page.total).toBe(1)
    const view = page.items[0]
    expect(view?.id).toBe(subscription.id)
    expect(view?.viewer).toBe('member')
    expect(view?.price).toBe(5_975)
    expect(view?.member?.shareMinor).toBe(5_975)
    expect(view?.ownerName).toBe('User owner')
    expect(view?.notes).toBeNull()
    expect(view?.payer).toBeNull()
    expect(view?.paymentMethodId).toBeNull()
    expect(view?.paymentMethodName).toBeNull()

    const ownerPage = await listSubscriptions(db, 'owner', {
      limit: 50,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })
    expect(ownerPage.items[0]?.viewer).toBe('owner')
    expect(ownerPage.items[0]?.price).toBe(23_900)
    expect(ownerPage.items[0]?.notes).toBe('Family plan password: hunter2')
  })

  it('counts the split on the owner row only', async () => {
    const { db } = await accepted()

    const ownerPage = await listSubscriptions(db, 'owner', {
      limit: 50,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })
    expect(ownerPage.items[0]?.sharedCount).toBe(1)

    const memberPage = await listSubscriptions(db, 'friend', {
      limit: 50,
      offset: 0,
      sort: 'next-payment',
      order: 'asc',
    })
    expect(memberPage.items[0]?.sharedCount).toBe(0)
  })

  it('knows when shrinking the price would strand agreed shares', async () => {
    const { db, subscription } = await accepted()

    expect(await priceCoversShares(db, subscription.id, 23_900)).toBe(true)
    expect(await priceCoversShares(db, subscription.id, 5_000)).toBe(false)
  })
})

describe('shared reads: money', () => {
  it('counts only the share in the member’s budget', async () => {
    const { db } = await accepted()

    const status = await getBudgetStatus(db, 'friend', {
      now,
      ...fakeFetch(ratesPayload),
    })
    expect(status.dueMinor).toBe(5_975)

    const ownerStatus = await getBudgetStatus(db, 'owner', {
      now,
      ...fakeFetch(ratesPayload),
    })
    expect(ownerStatus.dueMinor).toBe(23_900)
  })

  it('counts only the share in the member’s dashboard', async () => {
    const { db } = await accepted()

    const summary = await getDashboardSummary(db, 'friend', {
      now,
      ...fakeFetch(ratesPayload),
    })
    expect(summary.monthlyTotalMinor).toBe(5_975)
    expect(summary.upcoming).toHaveLength(1)
    expect(summary.upcoming[0]?.price).toBe(5_975)

    const ownerSummary = await getDashboardSummary(db, 'owner', {
      now,
      ...fakeFetch(ratesPayload),
    })
    expect(ownerSummary.monthlyTotalMinor).toBe(23_900)
  })
})

describe('shared reads: reminders', () => {
  it('reminds the member at their share and the owner at the full price', async () => {
    const { db } = await accepted()

    await runDueReminders(db, 'friend', { now })
    await runDueReminders(db, 'owner', { now })

    const friendItems = await listNotifications(db, 'friend', { limit: 10 })
    expect(friendItems).toHaveLength(1)
    expect(friendItems[0]?.subscriptionPrice).toBe(5_975)
    expect(friendItems[0]?.body).toContain('59.75')

    const ownerItems = await listNotifications(db, 'owner', { limit: 10 })
    expect(ownerItems[0]?.subscriptionPrice).toBe(23_900)

    const summary = await inboxSummary(db, 'friend', friendItems, {
      now,
      ...fakeFetch(ratesPayload),
    })
    expect(summary.weekTotalMinor).toBe(5_975)
  })

  it('keeps quiet when the member turns their reminder off', async () => {
    const { db, memberId } = await accepted()

    await setMemberReminder(db, 'friend', memberId, false)
    await runDueReminders(db, 'friend', { now })

    expect(await listNotifications(db, 'friend', { limit: 10 })).toHaveLength(0)
  })
})

describe('shared reads: export and calendar feed', () => {
  it('keeps another payer’s subscription out of the export', async () => {
    const { db } = await accepted()

    const friendBundle = await exportBundle(db, 'friend')
    expect(friendBundle.subscriptions).toHaveLength(0)

    const ownerBundle = await exportBundle(db, 'owner')
    expect(ownerBundle.subscriptions).toHaveLength(1)
    expect(ownerBundle.subscriptions[0]?.priceMinor).toBe(23_900)
  })

  it('emits the member’s feed at their share without the owner’s notes', async () => {
    const { db } = await accepted()

    const feed = await buildUserIcalFeed(db, 'friend', now)
    expect(feed).toMatch(/SUMMARY:YouTube Premium Family — DKK\s59\.75/)
    expect(feed).not.toContain('hunter2')
    expect(feed).not.toMatch(/DKK\s239\.00/)
  })
})
