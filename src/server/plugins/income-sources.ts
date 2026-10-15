import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as incomeSources from '../services/income-sources'
import * as settings from '../services/settings'
import { incomeSourceBodySchema, incomeSourcePatchSchema } from '../validation'

export const incomeSourcesPlugin = () =>
  ({
    id: 'income-sources',
    schema: {
      incomeSource: {
        fields: {
          name: { type: 'string', required: true },
          amountMinor: { type: 'number', required: true },
          currency: { type: 'string', required: true },
          cycleUnit: { type: 'string', required: true },
          cycleCount: { type: 'number', required: true },
          nextArrival: { type: 'date', required: true },
          startDate: { type: 'date', required: false },
          archivedAt: { type: 'date', required: false },
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
      listIncomeSources: createAuthEndpoint(
        '/income-sources/list',
        {
          method: 'GET',
          query: z.object({ includeArchived: z.stringbool().default(false) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          return ctx.json(
            await incomeSources.listIncomeSources(db, userId, ctx.query),
          )
        },
      ),
      getIncomeSource: createAuthEndpoint(
        '/income-sources/get',
        {
          method: 'GET',
          query: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const source = await incomeSources.getIncomeSource(
            db,
            userId,
            ctx.query.id,
          )
          if (!source) {
            throw new APIError('NOT_FOUND', {
              message: 'INCOME_SOURCE_NOT_FOUND',
            })
          }
          return ctx.json(source)
        },
      ),
      createIncomeSource: createAuthEndpoint(
        '/income-sources/create',
        {
          method: 'POST',
          body: incomeSourceBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const userSettings = await settings.getSettings(db, userId)
          const source = await incomeSources.createIncomeSource(db, userId, {
            ...ctx.body,
            currency: ctx.body.currency ?? userSettings.currency,
          })
          if (!source) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'INCOME_SOURCE_CREATE_FAILED',
            })
          }
          return ctx.json(source)
        },
      ),
      updateIncomeSource: createAuthEndpoint(
        '/income-sources/update',
        {
          method: 'POST',
          body: incomeSourcePatchSchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const { id, ...patch } = ctx.body
          const source = await incomeSources.updateIncomeSource(
            db,
            userId,
            id,
            patch,
          )
          if (!source) {
            throw new APIError('NOT_FOUND', {
              message: 'INCOME_SOURCE_NOT_FOUND',
            })
          }
          return ctx.json(source)
        },
      ),
      archiveIncomeSource: createAuthEndpoint(
        '/income-sources/archive',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const source = await incomeSources.archiveIncomeSource(
            db,
            userId,
            ctx.body.id,
          )
          if (!source) {
            throw new APIError('NOT_FOUND', {
              message: 'INCOME_SOURCE_NOT_FOUND',
            })
          }
          return ctx.json(source)
        },
      ),
      restoreIncomeSource: createAuthEndpoint(
        '/income-sources/restore',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const source = await incomeSources.restoreIncomeSource(
            db,
            userId,
            ctx.body.id,
          )
          if (!source) {
            throw new APIError('NOT_FOUND', {
              message: 'INCOME_SOURCE_NOT_FOUND',
            })
          }
          return ctx.json(source)
        },
      ),
      deleteIncomeSource: createAuthEndpoint(
        '/income-sources/delete',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const source = await incomeSources.deleteIncomeSource(
            db,
            userId,
            ctx.body.id,
          )
          if (!source) {
            throw new APIError('NOT_FOUND', {
              message: 'INCOME_SOURCE_NOT_FOUND',
            })
          }
          return ctx.json({ success: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
