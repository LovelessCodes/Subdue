import { dirname, join, resolve } from 'node:path'

export function resolveDatabasePath(): string {
  return resolve(process.env.DATABASE_PATH?.trim() || './data/subdue.db')
}

export function dataDir(): string {
  return resolve(process.env.DATA_DIR?.trim() || dirname(resolveDatabasePath()))
}

export function logosDir(): string {
  return join(dataDir(), 'logos')
}
