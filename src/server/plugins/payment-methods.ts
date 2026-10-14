import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as paymentMethods from '../services/payment-methods'

export const paymentMethodsPlugin = () =>
  ({
    id: 'payment-methods',
    schema: {
      paymentMethod: {
        fields: {
          name: { type: 'string', required: true },
          icon: { type: 'string', required: false },
          userId: {
            type: 'string',
            required: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          createdAt: { type: 'date', required: true },
        },
        indexes: [{ fields: ['userId'] }],
      },
    },
    endpoints: {
      listPaymentMethods: createAuthEndpoint(
        '/payment-methods/list',
        {
          method: 'GET',
          query: z.object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
            offset: z.coerce.number().int().min(0).default(0),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          return ctx.json(
            await paymentMethods.listPaymentMethods(db, userId, ctx.query),
          )
        },
      ),
      getPaymentMethod: createAuthEndpoint(
        '/payment-methods/get',
        {
          method: 'GET',
          query: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const paymentMethod = await paymentMethods.getPaymentMethod(
            db,
            userId,
            ctx.query.id,
          )
          if (!paymentMethod) {
            throw new APIError('NOT_FOUND', {
              message: 'PAYMENT_METHOD_NOT_FOUND',
            })
          }
          return ctx.json(paymentMethod)
        },
      ),
      createPaymentMethod: createAuthEndpoint(
        '/payment-methods/create',
        {
          method: 'POST',
          body: z.object({
            name: z.string().min(1).max(100),
            icon: z.string().max(200).nullish(),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const paymentMethod = await paymentMethods.createPaymentMethod(
            db,
            userId,
            ctx.body,
          )
          if (!paymentMethod) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'PAYMENT_METHOD_CREATE_FAILED',
            })
          }
          return ctx.json(paymentMethod)
        },
      ),
      updatePaymentMethod: createAuthEndpoint(
        '/payment-methods/update',
        {
          method: 'POST',
          body: z.object({
            id: z.string(),
            name: z.string().min(1).max(100).optional(),
            icon: z.string().max(200).nullish(),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const { id, ...patch } = ctx.body
          const paymentMethod = await paymentMethods.updatePaymentMethod(
            db,
            userId,
            id,
            patch,
          )
          if (!paymentMethod) {
            throw new APIError('NOT_FOUND', {
              message: 'PAYMENT_METHOD_NOT_FOUND',
            })
          }
          return ctx.json(paymentMethod)
        },
      ),
      deletePaymentMethod: createAuthEndpoint(
        '/payment-methods/delete',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const deleted = await paymentMethods.deletePaymentMethod(
            db,
            userId,
            ctx.body.id,
          )
          if (!deleted) {
            throw new APIError('NOT_FOUND', {
              message: 'PAYMENT_METHOD_NOT_FOUND',
            })
          }
          return ctx.json({ success: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
