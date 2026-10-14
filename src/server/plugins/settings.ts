import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as settings from '../services/settings'

export const settingsPlugin = () =>
  ({
    id: 'settings',
    schema: {
      userSetting: {
        fields: {
          currency: { type: 'string', required: false },
          locale: { type: 'string', required: false },
          weekStart: { type: 'string', required: false },
          theme: { type: 'string', required: false },
          userId: {
            type: 'string',
            required: true,
            unique: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          createdAt: { type: 'date', required: false },
        },
      },
    },
    endpoints: {
      getSettings: createAuthEndpoint(
        '/settings/get',
        {
          method: 'GET',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          return ctx.json(await settings.getSettings(db, userId))
        },
      ),
      updateSettings: createAuthEndpoint(
        '/settings/update',
        {
          method: 'POST',
          body: z.object({
            currency: z
              .string()
              .regex(/^[A-Z]{3}$/)
              .optional(),
            locale: z.string().min(2).max(20).optional(),
            weekStart: z.enum(settings.weekStarts).optional(),
            theme: z.enum(settings.themes).optional(),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          return ctx.json(await settings.updateSettings(db, userId, ctx.body))
        },
      ),
    },
  }) satisfies BetterAuthPlugin
