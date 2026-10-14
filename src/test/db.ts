import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/lib/auth-schema'
import { user } from '@/lib/auth-schema'
import type { Database as AppDatabase } from '@/lib/db'

export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  return { sqlite, db }
}

export async function insertTestUser(db: AppDatabase, id: string) {
  await db.insert(user).values({
    id,
    name: `User ${id}`,
    email: `${id}@test.local`,
  })
}
