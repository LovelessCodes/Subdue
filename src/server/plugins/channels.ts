import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as channels from '../services/channels'
import * as deliveries from '../services/deliveries'
import { channelBodySchema, channelPatchSchema } from '../validation'

export const channelsPlugin = () =>
  ({
    id: 'channels',
    schema: {
      channel: {
        fields: {
          type: { type: 'string', required: true },
          name: { type: 'string', required: true },
          enabled: { type: 'boolean', required: true },
          config: { type: 'string', required: true },
          userId: {
            type: 'string',
            required: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          createdAt: { type: 'date', required: true },
        },
        indexes: [{ fields: ['userId'] }],
      },
      notificationDelivery: {
        fields: {
          status: { type: 'string', required: true },
          attempts: { type: 'number', required: true },
          lastError: { type: 'string', required: false },
          sentAt: { type: 'date', required: false },
          notificationId: {
            type: 'string',
            required: true,
            references: {
              model: 'notification',
              field: 'id',
              onDelete: 'cascade',
            },
          },
          channelId: {
            type: 'string',
            required: true,
            references: {
              model: 'channel',
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
          { fields: ['notificationId', 'channelId'], unique: true },
          { fields: ['userId'] },
        ],
      },
    },
    endpoints: {
      listChannels: createAuthEndpoint(
        '/channels/list',
        {
          method: 'GET',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const rows = await channels.listChannels(db, userId)
          return ctx.json({ items: rows.map(channels.channelView) })
        },
      ),
      createChannel: createAuthEndpoint(
        '/channels/create',
        {
          method: 'POST',
          body: channelBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          let config: channels.ChannelConfig
          try {
            config = channels.parseChannelConfig(ctx.body.type, ctx.body.config)
          } catch (error) {
            if (error instanceof z.ZodError) {
              throw new APIError('BAD_REQUEST', {
                message: 'CHANNEL_CONFIG_INVALID',
              })
            }
            throw error
          }
          const row = await channels.createChannel(db, userId, {
            type: ctx.body.type,
            name: ctx.body.name,
            config,
            enabled: ctx.body.enabled,
          })
          return ctx.json(channels.channelView(row))
        },
      ),
      updateChannel: createAuthEndpoint(
        '/channels/update',
        {
          method: 'POST',
          body: channelPatchSchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const { id, ...patch } = ctx.body
          let row: channels.Channel | null
          try {
            row = await channels.updateChannel(db, userId, id, patch)
          } catch (error) {
            if (error instanceof z.ZodError) {
              throw new APIError('BAD_REQUEST', {
                message: 'CHANNEL_CONFIG_INVALID',
              })
            }
            throw error
          }
          if (!row) {
            throw new APIError('NOT_FOUND', { message: 'CHANNEL_NOT_FOUND' })
          }
          return ctx.json(channels.channelView(row))
        },
      ),
      deleteChannel: createAuthEndpoint(
        '/channels/delete',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const deleted = await channels.deleteChannel(db, userId, ctx.body.id)
          if (!deleted) {
            throw new APIError('NOT_FOUND', { message: 'CHANNEL_NOT_FOUND' })
          }
          return ctx.json({ success: true })
        },
      ),
      testChannel: createAuthEndpoint(
        '/channels/test',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const target = await channels.getChannel(db, userId, ctx.body.id)
          if (!target) {
            throw new APIError('NOT_FOUND', { message: 'CHANNEL_NOT_FOUND' })
          }

          const { senders } = await import('../senders')
          const type = target.type as channels.ChannelType
          const sender = senders[type]
          if (!sender) {
            return ctx.json({
              ok: false,
              error: `unknown channel type ${type}`,
            })
          }

          try {
            await sender(
              {
                title: 'Subdue test notification',
                body: `This is a test from Subdue. If you can read this, "${target.name}" works.`,
              },
              channels.decodeChannelConfig(type, target.config),
            )
            return ctx.json({ ok: true })
          } catch (error) {
            return ctx.json({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
      ),
      listDeliveries: createAuthEndpoint(
        '/channels/deliveries',
        {
          method: 'GET',
          query: z.object({
            limit: z.coerce.number().int().min(1).max(100).default(20),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const items = await deliveries.listDeliveries(
            db,
            userId,
            ctx.query.limit,
          )
          return ctx.json({ items })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
