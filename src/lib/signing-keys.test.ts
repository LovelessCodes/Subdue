import { describe, expect, it } from 'vitest'
import { repairSigningKeys } from '@/lib/signing-keys'
import { createTestDb } from '@/test/db'

describe('signing key repair', () => {
  it('drops rows that the current code path cannot read', () => {
    const { sqlite } = createTestDb()

    sqlite
      .prepare(
        'INSERT INTO jwks (id, public_key, private_key, created_at) VALUES (?, ?, ?, ?)',
      )
      .run('encrypted', '{}', '{"iv":"abc","data":"def"}', 0)
    sqlite
      .prepare(
        'INSERT INTO jwks (id, public_key, private_key, created_at) VALUES (?, ?, ?, ?)',
      )
      .run('plain', '{}', '{"kty":"OKP","crv":"Ed25519","d":"x"}', 0)

    repairSigningKeys(sqlite)

    const rows = sqlite.prepare('SELECT id FROM jwks').all() as { id: string }[]
    expect(rows.map((row) => row.id)).toEqual(['plain'])
  })

  it('is a no-op on an empty table and on a fresh database', () => {
    const { sqlite } = createTestDb()

    expect(() => repairSigningKeys(sqlite)).not.toThrow()

    sqlite.exec('DROP TABLE jwks')
    expect(() => repairSigningKeys(sqlite)).not.toThrow()
  })
})
