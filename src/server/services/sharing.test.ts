import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { notification, subscriptionMember } from '@/lib/auth-schema'
import { createSubscription } from '@/server/services/subscriptions'
import {
  acceptInvite,
  createMember,
  deleteMember,
  inviteByToken,
  leaveSubscription,
  listMembers,
  mintInvite,
  revokeInvite,
  setMemberReminder,
  updateMember,
} from '@/server/services/sharing'
import { createTestDb, insertTestUser } from '@/test/db'

const now = new Date('2026-10-19T12:00:00.000Z')

async function setup() {
  const { db } = createTestDb()
  await insertTestUser(db, 'owner')
  await insertTestUser(db, 'friend')
  const subscription = await createSubscription(db, 'owner', {
    name: 'YouTube Premium Family',
    price: 23_900,
    currency: 'DKK',
    cycleUnit: 'months',
    cycleCount: 1,
    nextPayment: new Date('2026-11-02T00:00:00.000Z'),
  })
  return { db, subscription: subscription! }
}

describe('sharing: members', () => {
  it('adds a placeholder and counts it in the split', async () => {
    const { db, subscription } = await setup()

    const member = await createMember(db, 'owner', subscription.id, {
      displayName: 'Freja',
      shareMinor: 5_975,
    })
    expect(member).not.toBeTypeOf('string')

    const members = await listMembers(db, subscription.id)
    expect(members.map((row) => row.displayName)).toEqual(['Freja'])
    expect(members[0]?.status).toBe('placeholder')
  })

  it('refuses shares that push the split over the price', async () => {
    const { db, subscription } = await setup()
    await createMember(db, 'owner', subscription.id, {
      displayName: 'Anna',
      shareMinor: 20_000,
    })

    const blocked = await createMember(db, 'owner', subscription.id, {
      displayName: 'Jonas',
      shareMinor: 5_975,
    })
    expect(blocked).toBe('OVER_ALLOCATED')
    expect(await listMembers(db, subscription.id)).toHaveLength(1)
  })

  it('blocks a share change that would over-allocate', async () => {
    const { db, subscription } = await setup()
    const first = await createMember(db, 'owner', subscription.id, {
      displayName: 'Anna',
      shareMinor: 20_000,
    })
    const second = await createMember(db, 'owner', subscription.id, {
      displayName: 'Jonas',
      shareMinor: 3_900,
    })
    if (typeof first === 'string' || typeof second === 'string') {
      throw new Error('setup failed')
    }

    expect(
      await updateMember(db, 'owner', second.id, { shareMinor: 5_000 }),
    ).toBe('OVER_ALLOCATED')
    expect(
      await updateMember(db, 'owner', second.id, { shareMinor: 3_900 }),
    ).not.toBeTypeOf('string')
  })

  it('will not touch another owner’s split', async () => {
    const { db, subscription } = await setup()
    const member = await createMember(db, 'owner', subscription.id, {
      displayName: 'Anna',
      shareMinor: 5_975,
    })
    if (typeof member === 'string') throw new Error('setup failed')

    expect(await updateMember(db, 'friend', member.id, { shareMinor: 1 })).toBe(
      'MEMBER_NOT_FOUND',
    )
    expect(await deleteMember(db, 'friend', member.id)).toBe(false)
  })
})

describe('sharing: invites', () => {
  it('mints a one-time token, stores only its hash, and accepts once', async () => {
    const { db, subscription } = await setup()
    const member = await createMember(db, 'owner', subscription.id, {
      displayName: 'Jonas',
      shareMinor: 5_975,
    })
    if (typeof member === 'string') throw new Error('setup failed')

    const invite = await mintInvite(db, 'owner', member.id, now)
    if (typeof invite === 'string') throw new Error('mint failed')

    const stored = (await listMembers(db, subscription.id))[0]
    expect(stored?.inviteHash).toBeTruthy()
    expect(stored?.inviteHash).not.toBe(invite.token)
    expect(stored?.status).toBe('invited')

    const view = await inviteByToken(db, invite.token, now)
    expect(view?.subscription.name).toBe('YouTube Premium Family')
    expect(view?.ownerName).toBe('User owner')
    expect(view?.member.shareMinor).toBe(5_975)

    expect(await inviteByToken(db, 'not-a-token', now)).toBeNull()

    const accepted = await acceptInvite(db, 'friend', invite.token, now)
    expect(accepted).toEqual({ subscriptionId: subscription.id })

    expect(await inviteByToken(db, invite.token, now)).toBeNull()
    expect(await acceptInvite(db, 'friend', invite.token, now)).toBe(
      'INVITE_NOT_FOUND',
    )

    const after = (await listMembers(db, subscription.id))[0]
    expect(after?.status).toBe('active')
    expect(after?.userId).toBe('friend')
    expect(after?.inviteHash).toBeNull()
  })

  it('expires a token after seven days', async () => {
    const { db, subscription } = await setup()
    const member = await createMember(db, 'owner', subscription.id, {
      displayName: 'Jonas',
      shareMinor: 5_975,
    })
    if (typeof member === 'string') throw new Error('setup failed')
    const invite = await mintInvite(db, 'owner', member.id, now)
    if (typeof invite === 'string') throw new Error('mint failed')

    const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
    expect(await inviteByToken(db, invite.token, later)).toBeNull()
    expect(await acceptInvite(db, 'friend', invite.token, later)).toBe(
      'INVITE_NOT_FOUND',
    )
  })

  it('revokes an invite back to a placeholder', async () => {
    const { db, subscription } = await setup()
    const member = await createMember(db, 'owner', subscription.id, {
      displayName: 'Jonas',
      shareMinor: 5_975,
    })
    if (typeof member === 'string') throw new Error('setup failed')
    const invite = await mintInvite(db, 'owner', member.id, now)
    if (typeof invite === 'string') throw new Error('mint failed')

    expect(await revokeInvite(db, 'owner', member.id)).toBe(true)
    expect(await inviteByToken(db, invite.token, now)).toBeNull()
    expect((await listMembers(db, subscription.id))[0]?.status).toBe(
      'placeholder',
    )
  })
})

describe('sharing: exit and reminders', () => {
  async function setupAccepted() {
    const context = await setup()
    const member = await createMember(
      context.db,
      'owner',
      context.subscription.id,
      { displayName: 'Jonas', shareMinor: 5_975 },
    )
    if (typeof member === 'string') throw new Error('setup failed')
    const invite = await mintInvite(context.db, 'owner', member.id, now)
    if (typeof invite === 'string') throw new Error('mint failed')
    await acceptInvite(context.db, 'friend', invite.token, now)
    return { ...context, memberId: member.id }
  }

  it('removing a member deletes their notifications for the subscription', async () => {
    const { db, subscription, memberId } = await setupAccepted()

    await db.insert(notification).values({
      id: crypto.randomUUID(),
      type: 'upcoming',
      title: 'YouTube renews soon',
      body: 'DKK 59.75 due soon.',
      dueDate: new Date('2026-11-02T00:00:00.000Z'),
      subscriptionId: subscription.id,
      userId: 'friend',
      createdAt: now,
    })

    expect(await deleteMember(db, 'owner', memberId)).toBe(true)
    expect(await db.select().from(notification)).toHaveLength(0)
    expect(await listMembers(db, subscription.id)).toHaveLength(0)
  })

  it('a member leaving cleans up their own notifications', async () => {
    const { db, subscription, memberId } = await setupAccepted()

    await db.insert(notification).values({
      id: crypto.randomUUID(),
      type: 'upcoming',
      title: 'YouTube renews soon',
      body: 'DKK 59.75 due soon.',
      dueDate: new Date('2026-11-02T00:00:00.000Z'),
      subscriptionId: subscription.id,
      userId: 'friend',
      createdAt: now,
    })

    expect(await leaveSubscription(db, 'owner', memberId)).toBe(false)
    expect(await leaveSubscription(db, 'friend', memberId)).toBe(true)
    expect(await db.select().from(notification)).toHaveLength(0)
    expect(await listMembers(db, subscription.id)).toHaveLength(0)
  })

  it('lets a member toggle their own reminder', async () => {
    const { db, memberId } = await setupAccepted()

    expect(await setMemberReminder(db, 'owner', memberId, true)).toBe(false)
    expect(await setMemberReminder(db, 'friend', memberId, false)).toBe(true)

    const rows = await db
      .select({ remindEnabled: subscriptionMember.remindEnabled })
      .from(subscriptionMember)
      .where(eq(subscriptionMember.id, memberId))
    expect(rows[0]?.remindEnabled).toBe(false)
  })
})
