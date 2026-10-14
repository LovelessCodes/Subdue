import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as reminders from '../services/reminders'

export const notificationsPlugin = () =>
  ({
    id: 'notifications',
    schema: {
      notification: {
        fields: {
          type: { type: 'string', required: true },
          title: { type: 'string', required: true },
          body: { type: 'string', required: true },
          dueDate: { type: 'date', required: true },
          readAt: { type: 'date', required: false },
          subscriptionId: {
            type: 'string',
            required: true,
            references: {
              model: 'subscription',
              field: 'id',
              onDelete: 'cascade',
            },
          },
          userId: {
            type: 'string',
            required: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          createdAt: { type: 'date', required: true },
        },
        indexes: [
          {
            fields: ['userId', 'subscriptionId', 'type', 'dueDate'],
            unique: true,
          },
          { fields: ['userId'] },
        ],
      },
    },
    endpoints: {
      listNotifications: createAuthEndpoint(
        '/notifications/list',
        {
          method: 'GET',
          query: z.object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
            unreadOnly: z.coerce.boolean().optional(),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const [items, unread] = await Promise.all([
            reminders.listNotifications(db, userId, ctx.query),
            reminders.unreadCount(db, userId),
          ])
          return ctx.json({ items, unread })
        },
      ),
      markNotificationsRead: createAuthEndpoint(
        '/notifications/read',
        {
          method: 'POST',
          body: z.object({
            ids: z.array(z.string()).optional(),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const marked = await reminders.markNotificationsRead(
            db,
            userId,
            ctx.body.ids,
          )
          return ctx.json({
            marked,
            unread: await reminders.unreadCount(db, userId),
          })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
