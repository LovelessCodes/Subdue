import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SqliteDatabase from 'better-sqlite3'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseSubscriptionsCsv,
  parseWallosBackup,
  runImport,
} from '@/server/services/import'
import { exportSubscriptionsCsv } from '@/server/services/export'
import { createCategory } from '@/server/services/categories'
import { createPaymentMethod } from '@/server/services/payment-methods'
import {
  createSubscription,
  getSubscription,
  listSubscriptions,
} from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

function wallosDatabase(): SqliteDatabase.Database {
  const sqlite = new SqliteDatabase(':memory:')
  sqlite.exec(`
    CREATE TABLE currencies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, symbol TEXT NOT NULL, code TEXT NOT NULL, rate TEXT NOT NULL);
    CREATE TABLE cycles (id INTEGER PRIMARY KEY, days INTEGER NOT NULL, name TEXT NOT NULL);
    CREATE TABLE frequencies (id INTEGER PRIMARY KEY, name INTEGER NOT NULL);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE household (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon TEXT);
    CREATE TABLE subscriptions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      logo TEXT,
      price REAL NOT NULL,
      currency_id INTEGER,
      next_payment DATE,
      cycle INTEGER,
      frequency INTEGER,
      notes TEXT,
      payment_method_id INTEGER,
      payer_user_id INTEGER,
      category_id INTEGER,
      notify BOOLEAN DEFAULT false,
      inactive INTEGER DEFAULT 0,
      url TEXT,
      auto_renew INTEGER DEFAULT 1,
      cancellation_date TEXT
    );
    INSERT INTO currencies (id, name, symbol, code, rate) VALUES
      (1, 'Danish Krone', 'kr', 'DKK', '1'),
      (2, 'Japanese Yen', '¥', 'JPY', '1');
    INSERT INTO cycles (id, days, name) VALUES
      (1, 1, 'Daily'), (2, 7, 'Weekly'), (3, 30, 'Monthly'),
      (4, 365, 'Yearly'), (5, 0, 'One-time');
    INSERT INTO categories (id, name) VALUES
      (1, 'No category'), (2, 'Domains'), (3, 'Insurance');
    INSERT INTO household (id, name) VALUES (1, 'Mads');
    INSERT INTO payment_methods (id, name, icon) VALUES
      (1, 'PayPal', 'paypal.png'), (2, 'Credit Card', 'creditcard.png');
    INSERT INTO subscriptions
      (name, price, currency_id, next_payment, cycle, frequency, notes, category_id, payer_user_id, inactive)
    VALUES
      ('Loveless.codes', 633.40, 1, '2026-10-30', 4, 1, 'renews Oct', 2, 1, 0),
      ('Quarterly Cloud', 49.95, 1, '2026-11-01', 3, 3, NULL, 2, NULL, 0),
      ('Gym', 250, 1, '2026-09-01', 3, 1, NULL, 1, NULL, 0),
      ('Tokyo Thing', 1000, 2, '2026-12-01', 3, 1, NULL, 3, NULL, 0),
      ('Mystery Currency', 5, 99, '2026-12-05', 3, 1, NULL, 1, NULL, 0),
      ('Old Thing', 10, 1, '2026-01-01', 3, 1, NULL, 1, NULL, 1),
      ('Wallos One-off', 99, 1, '2026-05-01', 5, 1, NULL, 1, NULL, 0);
    UPDATE subscriptions
      SET url = 'https://loveless.codes/', payment_method_id = 2,
          auto_renew = 0, logo = 'loveless.png'
      WHERE name = 'Loveless.codes';
    UPDATE subscriptions
      SET cancellation_date = '2026-11-06', payment_method_id = 1
      WHERE name = 'Gym';
  `)
  return sqlite
}

function wallosZip(): Uint8Array {
  const sqlite = wallosDatabase()
  const bytes = new Uint8Array(sqlite.serialize())
  sqlite.close()
  return zipSync({
    'wallos.db': bytes,
    'logos/loveless.png': new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]),
  })
}

describe('wallos import', () => {
  let logoDir: string

  beforeEach(() => {
    logoDir = mkdtempSync(join(tmpdir(), 'subdue-import-logos-'))
    process.env.DATA_DIR = logoDir
  })

  afterEach(() => {
    rmSync(logoDir, { recursive: true, force: true })
    delete process.env.DATA_DIR
  })

  it('reads a zipped Wallos backup and maps subscriptions', () => {
    const parsed = parseWallosBackup(wallosZip(), { defaultCurrency: 'DKK' })
    const names = parsed.subscriptions.map((item) => item.name)

    expect(names).toEqual([
      'Loveless.codes',
      'Quarterly Cloud',
      'Gym',
      'Tokyo Thing',
      'Mystery Currency',
    ])

    const codes = parsed.subscriptions[0]
    expect(codes).toMatchObject({
      name: 'Loveless.codes',
      price: 63340,
      currency: 'DKK',
      cycleUnit: 'years',
      cycleCount: 1,
      category: 'Domains',
      paymentMethod: 'Credit Card',
      payer: 'Mads',
      url: 'https://loveless.codes/',
      notes: 'renews Oct',
      remindDaysBefore: null,
      autoRenew: false,
      cancelledAt: null,
      logo: 'loveless.png',
    })
    expect(codes?.nextPayment.toISOString()).toBe('2026-10-30T00:00:00.000Z')

    const quarterly = parsed.subscriptions[1]
    expect(quarterly).toMatchObject({
      price: 4995,
      cycleUnit: 'months',
      cycleCount: 3,
    })

    const gym = parsed.subscriptions[2]
    expect(gym?.category).toBeNull()
    expect(gym?.paymentMethod).toBe('PayPal')
    expect(gym?.cancelledAt?.toISOString()).toBe('2026-11-06T00:00:00.000Z')

    const tokyo = parsed.subscriptions[3]
    expect(tokyo).toMatchObject({ price: 1000, currency: 'JPY' })

    const mystery = parsed.subscriptions[4]
    expect(mystery).toMatchObject({ currency: 'DKK', price: 500 })

    expect(parsed.categories.sort()).toEqual(['Domains', 'Insurance'])
    expect(parsed.paymentMethods).toEqual(['PayPal', 'Credit Card'])

    const warnings = parsed.warnings.join('\n')
    expect(warnings).toContain('inactive')
    expect(warnings).toContain('one-time')
    expect(warnings).toContain('no known currency')
    expect(warnings).toContain('notification toggles')
  })

  it('accepts a raw wallos.db too', () => {
    const sqlite = wallosDatabase()
    const bytes = new Uint8Array(sqlite.serialize())
    sqlite.close()

    const parsed = parseWallosBackup(bytes, { defaultCurrency: 'DKK' })
    expect(parsed.subscriptions).toHaveLength(5)
  })

  it('maps the per-subscription reminder override when present', () => {
    const sqlite = new SqliteDatabase(':memory:')
    sqlite.exec(`
      CREATE TABLE currencies (id INTEGER PRIMARY KEY, code TEXT);
      CREATE TABLE cycles (id INTEGER PRIMARY KEY, days INTEGER);
      CREATE TABLE subscriptions (
        name TEXT, price REAL, currency_id INTEGER, next_payment TEXT,
        cycle INTEGER, frequency INTEGER, notify_days_before INTEGER
      );
      INSERT INTO cycles (id, days) VALUES (3, 30);
      INSERT INTO currencies (id, code) VALUES (1, 'DKK');
      INSERT INTO subscriptions
        (name, price, currency_id, next_payment, cycle, frequency, notify_days_before)
      VALUES
        ('Manual domain', 18.11, 1, '2027-05-31', 3, 1, 30),
        ('Default days', 5, 1, '2027-05-31', 3, 1, NULL);
    `)
    const bytes = new Uint8Array(sqlite.serialize())
    sqlite.close()

    const parsed = parseWallosBackup(bytes, { defaultCurrency: 'DKK' })
    expect(parsed.subscriptions[0]?.remindDaysBefore).toBe(30)
    expect(parsed.subscriptions[1]?.remindDaysBefore).toBeNull()
  })

  it('dry run counts match the real run and duplicates are skipped', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    const parsed = parseWallosBackup(wallosZip(), { defaultCurrency: 'DKK' })

    const dry = await runImport(db, 'u1', parsed, { dryRun: true })
    expect(dry.subscriptions.created).toBe(5)
    expect(dry.categories.created).toBe(2)
    expect(dry.paymentMethods.created).toBe(2)

    const applied = await runImport(db, 'u1', parsed)
    expect(applied.subscriptions.created).toBe(dry.subscriptions.created)
    expect(applied.categories.created).toBe(dry.categories.created)
    expect(applied.paymentMethods.created).toBe(dry.paymentMethods.created)

    const page = await listSubscriptions(db, 'u1', {
      limit: 100,
      offset: 0,
      sort: 'name',
      order: 'asc',
    })
    expect(page.total).toBe(5)

    expect(readdirSync(join(logoDir, 'logos'))).toContain('loveless.png')
    const stored = await getSubscription(
      db,
      'u1',
      page.items.find((item) => item.name === 'Loveless.codes')!.id,
    )
    expect(stored).toMatchObject({
      url: 'https://loveless.codes/',
      logo: 'loveless.png',
      autoRenew: false,
      paymentMethodName: 'Credit Card',
    })

    const again = await runImport(db, 'u1', parsed)
    expect(again.subscriptions.created).toBe(0)
    expect(again.subscriptions.skippedDuplicates).toBe(5)
    expect(again.categories.existing).toBe(2)
  })
})

describe('csv import', () => {
  it('round-trips its own export byte for byte', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await insertTestUser(db, 'u2')

    const category = await createCategory(db, 'u1', { name: 'Domains' })
    const method = await createPaymentMethod(db, 'u1', {
      name: 'Credit Card',
    })
    await createSubscription(db, 'u1', {
      name: 'Comma, Inc',
      price: 1234,
      currency: 'USD',
      cycleUnit: 'months',
      cycleCount: 1,
      nextPayment: new Date('2026-11-15T00:00:00.000Z'),
      categoryId: category?.id ?? null,
      paymentMethodId: method?.id ?? null,
      url: 'https://comma.example/pricing',
      notes: 'line one\nline two',
      remindDaysBefore: 7,
      autoRenew: false,
      cancelledAt: new Date('2026-12-01T00:00:00.000Z'),
    })
    await createSubscription(db, 'u1', {
      name: 'Plain One',
      price: 63340,
      currency: 'DKK',
      cycleUnit: 'years',
      cycleCount: 1,
      nextPayment: new Date('2026-10-30T00:00:00.000Z'),
    })

    const original = await exportSubscriptionsCsv(db, 'u1')
    const parsed = parseSubscriptionsCsv(original)
    const report = await runImport(db, 'u2', parsed)

    expect(report.subscriptions.created).toBe(2)
    const reimported = await exportSubscriptionsCsv(db, 'u2')
    expect(reimported).toBe(original)
  })

  it('rejects a csv without required columns', () => {
    expect(() => parseSubscriptionsCsv('name,price\nA,1')).toThrow(
      /missing required columns/,
    )
    expect(() => parseSubscriptionsCsv('')).toThrow(/empty/)
  })

  it('skips invalid rows with a warning', () => {
    const csv =
      'name,price_minor,currency,cycle_unit,cycle_count,next_payment\nGood,100,DKK,months,1,2026-11-01\nBad,oops,DKK,months,1,2026-11-01\n'
    const parsed = parseSubscriptionsCsv(csv)
    expect(parsed.subscriptions).toHaveLength(1)
    expect(parsed.warnings.join(' ')).toContain('Skipped 1 rows')
  })
})
