import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolveDatabasePath } from './paths'
import { ensureSetupToken } from './setup-token'
import { ensureScheduler } from '../server/scheduler'
import * as schema from './auth-schema'
import { repairSigningKeys } from './signing-keys'

const databasePath = resolveDatabasePath()

mkdirSync(dirname(databasePath), { recursive: true })

export const sqlite = new Database(databasePath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

migrate(db, {
  migrationsFolder: resolve(process.env.MIGRATIONS_PATH ?? './drizzle'),
})

repairSigningKeys(sqlite)

const adminCount = (
  sqlite
    .prepare("SELECT COUNT(*) AS count FROM user WHERE role = 'admin'")
    .get() as { count: number }
).count
const setupToken = ensureSetupToken(adminCount > 0)
if (setupToken) {
  const base = (
    process.env.BETTER_AUTH_URL?.trim() || 'http://localhost:3000'
  ).replace(/\/+$/, '')
  console.log(
    `[Frist] No administrator yet — sign in, then open ${base}/setup?token=${setupToken} to claim it.`,
  )
}

ensureScheduler(db)

export type Database = typeof db
