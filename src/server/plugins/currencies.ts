import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import * as z from 'zod'
import { db } from '../../lib/db'
import * as currencies from '../services/currencies'

const currencyCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((code) => code.toUpperCase())

export const currenciesPlugin = () =>
  ({
    id: 'currencies',
    schema: {
      exchangeRate: {
        fields: {
          quote: { type: 'string', required: true, unique: true },
          rate: { type: 'number', required: true },
          rateDate: { type: 'date', required: true },
          fetchedAt: { type: 'date', required: true },
        },
      },
    },
    endpoints: {
      listCurrencies: createAuthEndpoint(
        '/currencies/list',
        {
          method: 'GET',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { rows, stale } = await currencies.ensureRates(db)
          const rateDate = rows.reduce<Date | null>(
            (latest, row) =>
              !latest || row.rateDate > latest ? row.rateDate : latest,
            null,
          )

          return ctx.json({
            base: currencies.ECB_BASE,
            rateDate,
            stale,
            currencies: rows.map((row) => ({
              code: row.quote,
              rate: row.rate,
              rateDate: row.rateDate,
            })),
          })
        },
      ),
      convertCurrency: createAuthEndpoint(
        '/currencies/convert',
        {
          method: 'GET',
          query: z.object({
            amount: z.coerce.number().int().min(0),
            from: currencyCode,
            to: currencyCode,
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const result = await currencies.convertMinor(db, ctx.query)
          if (!result) {
            throw new APIError('NOT_FOUND', {
              message: 'RATE_UNAVAILABLE',
            })
          }
          return ctx.json(result)
        },
      ),
      refreshCurrencies: createAuthEndpoint(
        '/currencies/refresh',
        {
          method: 'POST',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          try {
            const rows = await currencies.refreshRates(db)
            return ctx.json({
              base: currencies.ECB_BASE,
              count: rows.length,
              fetchedAt: new Date(),
            })
          } catch {
            throw new APIError('BAD_GATEWAY', {
              message: 'RATE_REFRESH_FAILED',
            })
          }
        },
      ),
    },
  }) satisfies BetterAuthPlugin
