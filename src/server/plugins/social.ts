import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import { eq } from 'drizzle-orm'
import * as z from 'zod'
import { user } from '../../lib/auth-schema'
import { db } from '../../lib/db'
import { socialProviderUpdateSchema } from '../validation'

async function requireAdmin(userId: string): Promise<void> {
  const rows = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (rows[0]?.role !== 'admin') {
    throw new APIError('FORBIDDEN', { message: 'ADMIN_REQUIRED' })
  }
}

export const socialPlugin = () =>
  ({
    id: 'social',
    schema: {
      socialProvider: {
        fields: {
          provider: { type: 'string', required: true, unique: true },
          clientId: { type: 'string', required: true },
          clientSecret: { type: 'string', required: true },
          enabled: { type: 'boolean', required: true, defaultValue: true },
          extra: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
    },
    endpoints: {
      listSocialProviders: createAuthEndpoint(
        '/social/list',
        {
          method: 'GET',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          await requireAdmin(userId)
          const { listSocialProviders } =
            await import('../services/social-auth')
          return ctx.json({ items: await listSocialProviders(db) })
        },
      ),
      updateSocialProvider: createAuthEndpoint(
        '/social/update',
        {
          method: 'POST',
          body: socialProviderUpdateSchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          await requireAdmin(userId)
          const { upsertSocialProvider } =
            await import('../services/social-auth')
          const result = await upsertSocialProvider(db, ctx.body)
          if (result.error) {
            throw new APIError('BAD_REQUEST', { message: result.error })
          }
          return ctx.json(result.row)
        },
      ),
      removeSocialProvider: createAuthEndpoint(
        '/social/remove',
        {
          method: 'POST',
          body: z.object({
            provider: socialProviderUpdateSchema.shape.provider,
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          await requireAdmin(userId)
          const { removeSocialProvider } =
            await import('../services/social-auth')
          const removed = await removeSocialProvider(db, ctx.body.provider)
          if (!removed) {
            throw new APIError('NOT_FOUND', {
              message: 'SOCIAL_PROVIDER_NOT_FOUND',
            })
          }
          return ctx.json({ success: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
