import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as categories from '../services/categories'

export const categoriesPlugin = () =>
  ({
    id: 'categories',
    schema: {
      category: {
        fields: {
          name: { type: 'string', required: true },
          color: { type: 'string', required: false },
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
      listCategories: createAuthEndpoint(
        '/categories/list',
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
            await categories.listCategories(db, userId, ctx.query),
          )
        },
      ),
      getCategory: createAuthEndpoint(
        '/categories/get',
        {
          method: 'GET',
          query: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const category = await categories.getCategory(
            db,
            userId,
            ctx.query.id,
          )
          if (!category) {
            throw new APIError('NOT_FOUND', { message: 'CATEGORY_NOT_FOUND' })
          }
          return ctx.json(category)
        },
      ),
      createCategory: createAuthEndpoint(
        '/categories/create',
        {
          method: 'POST',
          body: z.object({
            name: z.string().min(1).max(100),
            color: z.string().max(20).nullish(),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const category = await categories.createCategory(db, userId, ctx.body)
          if (!category) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'CATEGORY_CREATE_FAILED',
            })
          }
          return ctx.json(category)
        },
      ),
      updateCategory: createAuthEndpoint(
        '/categories/update',
        {
          method: 'POST',
          body: z.object({
            id: z.string(),
            name: z.string().min(1).max(100).optional(),
            color: z.string().max(20).nullish(),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const { id, ...patch } = ctx.body
          const category = await categories.updateCategory(
            db,
            userId,
            id,
            patch,
          )
          if (!category) {
            throw new APIError('NOT_FOUND', { message: 'CATEGORY_NOT_FOUND' })
          }
          return ctx.json(category)
        },
      ),
      deleteCategory: createAuthEndpoint(
        '/categories/delete',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const deleted = await categories.deleteCategory(
            db,
            userId,
            ctx.body.id,
          )
          if (!deleted) {
            throw new APIError('NOT_FOUND', { message: 'CATEGORY_NOT_FOUND' })
          }
          return ctx.json({ success: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
