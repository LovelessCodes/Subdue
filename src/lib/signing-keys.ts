import type SqliteDatabase from 'better-sqlite3'

/**
 * Signing keys are written unencrypted (jwks.disablePrivateKeyEncryption), so
 * an instance keeps working after its secret changes. Older versions stored an
 * encrypted private key that the current code path can never read; drop those
 * rows so better-auth mints a fresh key on demand instead of failing at the
 * first signature.
 */
export function repairSigningKeys(sqlite: SqliteDatabase.Database): void {
  const table = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jwks'",
    )
    .get()
  if (!table) {
    return
  }

  const rows = sqlite.prepare('SELECT id, private_key FROM jwks').all() as {
    id: string
    private_key: string
  }[]

  for (const row of rows) {
    if (!String(row.private_key ?? '').includes('"kty"')) {
      sqlite.prepare('DELETE FROM jwks WHERE id = ?').run(row.id)
      console.warn(
        '[Subdue] Removed a signing key that was encrypted with a different secret; a replacement is generated on demand.',
      )
    }
  }
}
