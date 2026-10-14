import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { user } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { consumeSetupToken, getSetupToken } from '../../lib/setup-token'

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

export type SetupStatus = {
  hasAdmin: boolean
  hasToken: boolean
  isAdmin: boolean
}

export async function getSetupStatus(
  db: Database,
  userId: string,
): Promise<SetupStatus> {
  const [admins, rows] = await Promise.all([
    db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')),
    db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ])

  return {
    hasAdmin: admins.length > 0,
    hasToken: getSetupToken() !== null,
    isAdmin: rows[0]?.role === 'admin',
  }
}

export type ClaimResult = 'claimed' | 'already-admin' | 'invalid-token'

export async function claimAdmin(
  db: Database,
  userId: string,
  token: string,
): Promise<ClaimResult> {
  const expected = getSetupToken()
  if (!expected || !safeEqual(expected, token.trim())) {
    return 'invalid-token'
  }

  const rows = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (rows[0]?.role === 'admin') {
    consumeSetupToken()
    return 'already-admin'
  }

  await db.update(user).set({ role: 'admin' }).where(eq(user.id, userId))
  consumeSetupToken()
  return 'claimed'
}
