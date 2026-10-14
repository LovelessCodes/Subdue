import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { db } from '../../lib/db'
import * as ical from '../services/ical'

function tokenResponse(token: string) {
  return { token, path: `/api/ical/${token}` }
}

export const icalPlugin = () =>
  ({
    id: 'ical',
    endpoints: {
      icalStatus: createAuthEndpoint(
        '/ical/status',
        {
          method: 'GET',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const status = await ical.getIcalStatus(db, userId)
          return ctx.json({
            enabled: status.enabled,
            token: status.token,
            path: status.token ? `/api/ical/${status.token}` : null,
          })
        },
      ),
      icalEnable: createAuthEndpoint(
        '/ical/enable',
        {
          method: 'POST',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          return ctx.json(
            tokenResponse((await ical.enableIcal(db, userId)).token),
          )
        },
      ),
      icalRotate: createAuthEndpoint(
        '/ical/rotate',
        {
          method: 'POST',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          return ctx.json(
            tokenResponse((await ical.rotateIcal(db, userId)).token),
          )
        },
      ),
      icalDisable: createAuthEndpoint(
        '/ical/disable',
        {
          method: 'POST',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          await ical.disableIcal(db, userId)
          return ctx.json({ success: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
