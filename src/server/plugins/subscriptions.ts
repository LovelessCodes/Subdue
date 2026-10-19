import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import { removeLogo } from '../logos'
import * as settings from '../services/settings'
import * as subscriptions from '../services/subscriptions'
import {
  checkSubscriptionReferences,
  subscriptionBodySchema,
} from '../validation'

export const subscriptionsPlugin = () =>
  ({
    id: 'subscriptions',
    schema: {
      subscription: {
        fields: {
          name: { type: 'string', required: true },
          price: { type: 'number', required: true },
          currency: { type: 'string', required: true },
          cycleUnit: { type: 'string', required: true },
          cycleCount: { type: 'number', required: true },
          categoryId: {
            type: 'string',
            required: false,
            references: {
              model: 'category',
              field: 'id',
              onDelete: 'set null',
            },
          },
          paymentMethodId: {
            type: 'string',
            required: false,
            references: {
              model: 'paymentMethod',
              field: 'id',
              onDelete: 'set null',
            },
          },
          url: { type: 'string', required: false },
          nextPayment: { type: 'date', required: true },
          notes: { type: 'string', required: false },
          remindDaysBefore: { type: 'number', required: false },
          remindEnabled: {
            type: 'boolean',
            required: false,
            defaultValue: true,
          },
          autoRenew: { type: 'boolean', required: false, defaultValue: true },
          cancelledAt: { type: 'date', required: false },
          logo: { type: 'string', required: false },
          userId: {
            type: 'string',
            required: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          createdAt: { type: 'date', required: true },
        },
        indexes: [
          { fields: ['userId'] },
          { fields: ['categoryId'] },
          { fields: ['paymentMethodId'] },
        ],
      },
    },
    endpoints: {
      listSubscriptions: createAuthEndpoint(
        '/subscriptions/list',
        {
          method: 'GET',
          query: z.object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
            offset: z.coerce.number().int().min(0).default(0),
            categoryId: z.string().optional(),
            sort: z.enum(subscriptions.sortKeys).default('next-payment'),
            order: z.enum(['asc', 'desc']).default('asc'),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          return ctx.json(
            await subscriptions.listSubscriptions(db, userId, ctx.query),
          )
        },
      ),
      getSubscription: createAuthEndpoint(
        '/subscriptions/get',
        {
          method: 'GET',
          query: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const subscription = await subscriptions.getSubscription(
            db,
            userId,
            ctx.query.id,
          )
          if (!subscription) {
            throw new APIError('NOT_FOUND', {
              message: 'SUBSCRIPTION_NOT_FOUND',
            })
          }
          return ctx.json(subscription)
        },
      ),
      createSubscription: createAuthEndpoint(
        '/subscriptions/create',
        {
          method: 'POST',
          body: subscriptionBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const referenceError = await checkSubscriptionReferences(
            db,
            userId,
            ctx.body,
          )
          if (referenceError) {
            throw new APIError('BAD_REQUEST', { message: referenceError })
          }
          const userSettings = await settings.getSettings(db, userId)
          const subscription = await subscriptions.createSubscription(
            db,
            userId,
            {
              ...ctx.body,
              currency: ctx.body.currency ?? userSettings.currency,
            },
          )
          if (!subscription) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'SUBSCRIPTION_CREATE_FAILED',
            })
          }
          return ctx.json(subscription)
        },
      ),
      updateSubscription: createAuthEndpoint(
        '/subscriptions/update',
        {
          method: 'POST',
          body: subscriptionBodySchema.partial().extend({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const { id, ...patch } = ctx.body
          const referenceError = await checkSubscriptionReferences(
            db,
            userId,
            patch,
          )
          if (referenceError) {
            throw new APIError('BAD_REQUEST', { message: referenceError })
          }

          const existing = await subscriptions.getSubscription(db, userId, id)
          if (!existing) {
            throw new APIError('NOT_FOUND', {
              message: 'SUBSCRIPTION_NOT_FOUND',
            })
          }

          const subscription = await subscriptions.updateSubscription(
            db,
            userId,
            id,
            patch,
          )
          if (!subscription) {
            throw new APIError('NOT_FOUND', {
              message: 'SUBSCRIPTION_NOT_FOUND',
            })
          }

          if (
            patch.logo !== undefined &&
            existing.logo &&
            existing.logo !== subscription.logo
          ) {
            removeLogo(existing.logo)
          }

          return ctx.json(subscription)
        },
      ),
      deleteSubscription: createAuthEndpoint(
        '/subscriptions/delete',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const existing = await subscriptions.getSubscription(
            db,
            userId,
            ctx.body.id,
          )
          if (!existing) {
            throw new APIError('NOT_FOUND', {
              message: 'SUBSCRIPTION_NOT_FOUND',
            })
          }

          await subscriptions.deleteSubscription(db, userId, ctx.body.id)
          if (existing.logo) {
            removeLogo(existing.logo)
          }
          return ctx.json({ success: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
