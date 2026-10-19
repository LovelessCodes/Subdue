import { createHash, randomBytes } from 'node:crypto'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import {
  notification,
  subscription,
  subscriptionMember,
  user,
} from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export const MEMBER_STATUSES = ['placeholder', 'invited', 'active'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export type SubscriptionMember = typeof subscriptionMember.$inferSelect

export const INVITE_TTL_DAYS = 7

export type SharingError =
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'OVER_ALLOCATED'
  | 'INVITE_NOT_FOUND'
  | 'ALREADY_MEMBER'

export function generateInviteToken(): string {
  return randomBytes(16).toString('hex')
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function allocatedMinor(members: { shareMinor: number }[]): number {
  return members.reduce((sum, member) => sum + member.shareMinor, 0)
}

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Every member row for a subscription, oldest first — owner-scoped read.
 */
export async function listMembers(
  db: Database,
  subscriptionId: string,
): Promise<SubscriptionMember[]> {
  return db
    .select()
    .from(subscriptionMember)
    .where(eq(subscriptionMember.subscriptionId, subscriptionId))
    .orderBy(asc(subscriptionMember.createdAt))
}

async function ownSubscription(
  db: Database,
  ownerId: string,
  subscriptionId: string,
): Promise<{ id: string; price: number } | null> {
  const rows = await db
    .select({ id: subscription.id, price: subscription.price })
    .from(subscription)
    .where(
      and(
        eq(subscription.id, subscriptionId),
        eq(subscription.userId, ownerId),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

async function ownMember(
  db: Database,
  ownerId: string,
  memberId: string,
): Promise<SubscriptionMember | null> {
  const rows = await db
    .select({ member: subscriptionMember })
    .from(subscriptionMember)
    .innerJoin(
      subscription,
      eq(subscriptionMember.subscriptionId, subscription.id),
    )
    .where(
      and(
        eq(subscriptionMember.id, memberId),
        eq(subscription.userId, ownerId),
      ),
    )
    .limit(1)
  return rows[0]?.member ?? null
}

/**
 * Shares must sum to at most the price; the owner absorbs the remainder.
 * Blocks silently rewriting an agreed split when the price drops.
 */
async function fits(
  db: Database,
  subscriptionId: string,
  price: number,
  nextShare: number,
  excludeMemberId?: string,
): Promise<boolean> {
  const filters = [eq(subscriptionMember.subscriptionId, subscriptionId)]
  if (excludeMemberId) {
    filters.push(ne(subscriptionMember.id, excludeMemberId))
  }
  const rows = await db
    .select({
      value: sql<number>`coalesce(sum(${subscriptionMember.shareMinor}), 0)`,
    })
    .from(subscriptionMember)
    .where(and(...filters))
  return (rows[0]?.value ?? 0) + nextShare <= price
}

export async function createMember(
  db: Database,
  ownerId: string,
  subscriptionId: string,
  input: { displayName: string; email?: string | null; shareMinor: number },
  now: Date = new Date(),
): Promise<SubscriptionMember | SharingError> {
  const owned = await ownSubscription(db, ownerId, subscriptionId)
  if (!owned) {
    return 'SUBSCRIPTION_NOT_FOUND'
  }
  if (!(await fits(db, subscriptionId, owned.price, input.shareMinor))) {
    return 'OVER_ALLOCATED'
  }

  const rows = await db
    .insert(subscriptionMember)
    .values({
      id: crypto.randomUUID(),
      subscriptionId,
      userId: null,
      displayName: input.displayName,
      email: input.email ?? null,
      shareMinor: input.shareMinor,
      status: 'placeholder',
      createdAt: now,
    })
    .returning()

  const row = rows[0]
  return row ?? 'MEMBER_NOT_FOUND'
}

export async function updateMember(
  db: Database,
  ownerId: string,
  memberId: string,
  patch: { displayName?: string; email?: string | null; shareMinor?: number },
): Promise<SubscriptionMember | SharingError> {
  const member = await ownMember(db, ownerId, memberId)
  if (!member) {
    return 'MEMBER_NOT_FOUND'
  }
  if (patch.shareMinor !== undefined) {
    const owned = await ownSubscription(db, ownerId, member.subscriptionId)
    if (!owned) {
      return 'SUBSCRIPTION_NOT_FOUND'
    }
    if (
      !(await fits(
        db,
        member.subscriptionId,
        owned.price,
        patch.shareMinor,
        member.id,
      ))
    ) {
      return 'OVER_ALLOCATED'
    }
  }

  const values: Partial<typeof subscriptionMember.$inferInsert> = {}
  if (patch.displayName !== undefined) values.displayName = patch.displayName
  if (patch.email !== undefined) values.email = patch.email
  if (patch.shareMinor !== undefined) values.shareMinor = patch.shareMinor

  if (Object.keys(values).length === 0) {
    return member
  }

  const rows = await db
    .update(subscriptionMember)
    .set(values)
    .where(eq(subscriptionMember.id, member.id))
    .returning()
  return rows[0] ?? 'MEMBER_NOT_FOUND'
}

/** Removing a member also removes their notifications for the subscription. */
export async function deleteMember(
  db: Database,
  ownerId: string,
  memberId: string,
): Promise<boolean> {
  const member = await ownMember(db, ownerId, memberId)
  if (!member) {
    return false
  }

  db.transaction((tx) => {
    if (member.userId) {
      tx.delete(notification)
        .where(
          and(
            eq(notification.userId, member.userId),
            eq(notification.subscriptionId, member.subscriptionId),
          ),
        )
        .run()
    }
    tx.delete(subscriptionMember)
      .where(eq(subscriptionMember.id, member.id))
      .run()
  })

  return true
}

/**
 * Mints a single-use invite token. Only the hash is stored; the plain token
 * is returned once and never recoverable.
 */
export async function mintInvite(
  db: Database,
  ownerId: string,
  memberId: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date } | SharingError> {
  const member = await ownMember(db, ownerId, memberId)
  if (!member) {
    return 'MEMBER_NOT_FOUND'
  }

  const token = generateInviteToken()
  const expiresAt = inviteExpiry(now)

  await db
    .update(subscriptionMember)
    .set({
      status: 'invited',
      inviteHash: hashInviteToken(token),
      inviteExpiresAt: expiresAt,
    })
    .where(eq(subscriptionMember.id, member.id))

  return { token, expiresAt }
}

export async function revokeInvite(
  db: Database,
  ownerId: string,
  memberId: string,
): Promise<boolean> {
  const member = await ownMember(db, ownerId, memberId)
  if (!member || member.status === 'active') {
    return false
  }
  await db
    .update(subscriptionMember)
    .set({ status: 'placeholder', inviteHash: null, inviteExpiresAt: null })
    .where(eq(subscriptionMember.id, member.id))
  return true
}

export type InviteView = {
  member: SubscriptionMember
  subscription: {
    id: string
    name: string
    url: string | null
    logo: string | null
    price: number
    currency: string
    cycleUnit: string
    cycleCount: number
    nextPayment: Date
  }
  ownerName: string
}

/** Public lookup behind `/share/<token>`; only valid, unexpired, unconsumed. */
export async function inviteByToken(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<InviteView | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return null
  }

  const rows = await db
    .select({
      member: subscriptionMember,
      subscription: {
        id: subscription.id,
        name: subscription.name,
        url: subscription.url,
        logo: subscription.logo,
        price: subscription.price,
        currency: subscription.currency,
        cycleUnit: subscription.cycleUnit,
        cycleCount: subscription.cycleCount,
        nextPayment: subscription.nextPayment,
      },
      ownerName: user.name,
    })
    .from(subscriptionMember)
    .innerJoin(
      subscription,
      eq(subscriptionMember.subscriptionId, subscription.id),
    )
    .innerJoin(user, eq(subscription.userId, user.id))
    .where(
      and(
        eq(subscriptionMember.inviteHash, hashInviteToken(token)),
        eq(subscriptionMember.status, 'invited'),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) {
    return null
  }
  if (
    row.member.inviteExpiresAt &&
    row.member.inviteExpiresAt.getTime() <= now.getTime()
  ) {
    return null
  }
  return {
    member: row.member,
    subscription: row.subscription,
    ownerName: row.ownerName,
  }
}

export async function acceptInvite(
  db: Database,
  userId: string,
  token: string,
  now: Date = new Date(),
): Promise<{ subscriptionId: string } | SharingError> {
  const invite = await inviteByToken(db, token, now)
  if (!invite) {
    return 'INVITE_NOT_FOUND'
  }

  const existing = await db
    .select({ id: subscriptionMember.id })
    .from(subscriptionMember)
    .where(
      and(
        eq(subscriptionMember.subscriptionId, invite.subscription.id),
        eq(subscriptionMember.userId, userId),
      ),
    )
    .limit(1)
  if (existing.length > 0) {
    return 'ALREADY_MEMBER'
  }

  await db
    .update(subscriptionMember)
    .set({
      userId,
      status: 'active',
      inviteHash: null,
      inviteExpiresAt: null,
    })
    .where(eq(subscriptionMember.id, invite.member.id))

  return { subscriptionId: invite.subscription.id }
}

/** A member leaving; their share returns to the owner. */
export async function leaveSubscription(
  db: Database,
  userId: string,
  memberId: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(subscriptionMember)
    .where(
      and(
        eq(subscriptionMember.id, memberId),
        eq(subscriptionMember.userId, userId),
      ),
    )
    .limit(1)

  const member = rows[0]
  if (!member) {
    return false
  }

  db.transaction((tx) => {
    tx.delete(notification)
      .where(
        and(
          eq(notification.userId, userId),
          eq(notification.subscriptionId, member.subscriptionId),
        ),
      )
      .run()
    tx.delete(subscriptionMember)
      .where(eq(subscriptionMember.id, member.id))
      .run()
  })

  return true
}

export async function setMemberReminder(
  db: Database,
  userId: string,
  memberId: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(subscriptionMember)
    .set({ remindEnabled: enabled })
    .where(
      and(
        eq(subscriptionMember.id, memberId),
        eq(subscriptionMember.userId, userId),
      ),
    )
    .returning({ id: subscriptionMember.id })
  return rows.length > 0
}
