import { user } from '../lib/auth-schema'
import type { Database } from '../lib/db'
import { tickUser, type TickOptions } from './services/reminders'

export const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000
export const SCHEDULER_BOOT_DELAY_MS = 5 * 1000
const SCHEDULER_KEY = Symbol.for('frist.scheduler')

export async function tickAllUsers(
  db: Database,
  options: TickOptions = {},
): Promise<{ users: number }> {
  const now = options.now ?? new Date()
  const rows = await db.select({ id: user.id }).from(user)

  let processed = 0
  for (const row of rows) {
    try {
      await tickUser(db, row.id, { ...options, now })
      processed += 1
    } catch (error) {
      console.error(`scheduler tick failed for user ${row.id}`, error)
    }
  }

  return { users: processed }
}

export function ensureScheduler(db: Database): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return
  }

  const globals = globalThis as unknown as Record<symbol, unknown>
  if (globals[SCHEDULER_KEY]) {
    return
  }

  const run = () => {
    tickAllUsers(db).catch((error) => {
      console.error('scheduler tick failed', error)
    })
  }

  const boot = setTimeout(run, SCHEDULER_BOOT_DELAY_MS)
  const interval = setInterval(run, SCHEDULER_INTERVAL_MS)
  boot.unref?.()
  interval.unref?.()
  globals[SCHEDULER_KEY] = interval
}
