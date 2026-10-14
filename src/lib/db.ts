import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { ensureScheduler } from '../server/scheduler'
import * as schema from './auth-schema'
import { repairSigningKeys } from './signing-keys'

const databasePath = resolve(process.env.DATABASE_PATH ?? './data/subdue.db')

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

ensureScheduler(db)

export type Database = typeof db
