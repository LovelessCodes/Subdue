import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as subscriptions from '../services/subscriptions'

const cycleUnitSchema = z.enum(subscriptions.cycleUnits)

const subscriptionBody = z.object({
  name: z.string().min(1).max(200),
  price: z.number().int().min(0),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('DKK'),
  cycleUnit: cycleUnitSchema,
  cycleCount: z.number().int().min(1).max(365),
  categoryId: z.string().nullish(),
  payer: z.string().max(100).nullish(),
  nextPayment: z.coerce.date(),
  notes: z.string().max(2000).nullish(),
})

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
          payer: { type: 'string', required: false },
          nextPayment: { type: 'date', required: true },
          notes: { type: 'string', required: false },
          userId: {
            type: 'string',
            required: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          createdAt: { type: 'date', required: true },
        },
        indexes: [{ fields: ['userId'] }, { fields: ['categoryId'] }],
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
          body: subscriptionBody,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const subscription = await subscriptions.createSubscription(
            db,
            userId,
            ctx.body,
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
          body: subscriptionBody.partial().extend({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const { id, ...patch } = ctx.body
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
          const deleted = await subscriptions.deleteSubscription(
            db,
            userId,
            ctx.body.id,
          )
          if (!deleted) {
            throw new APIError('NOT_FOUND', {
              message: 'SUBSCRIPTION_NOT_FOUND',
            })
          }
          return ctx.json({ success: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
