import { describe, expect, it } from 'vitest'
import {
  buildUserIcalFeed,
  disableIcal,
  enableIcal,
  escapeIcalText,
  findUserIdByIcalToken,
  foldIcalLine,
  getIcalStatus,
  rotateIcal,
} from '@/server/services/ical'
import { updateSettings } from '@/server/services/settings'
import { createSubscription } from '@/server/services/subscriptions'
import { createTestDb, insertTestUser } from '@/test/db'

const now = new Date('2026-10-14T12:00:00.000Z')

describe('ical text helpers', () => {
  it('escapes reserved characters', () => {
    expect(escapeIcalText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne')
  })

  it('folds long lines at 75 octets with continuation spaces', () => {
    const line = `SUMMARY:${'x'.repeat(200)}`
    const folded = foldIcalLine(line)
    const parts = folded.split('\r\n ')

    expect(parts.length).toBeGreaterThan(2)
    expect(Buffer.byteLength(parts[0] ?? '')).toBeLessThanOrEqual(75)
    for (const part of parts.slice(1)) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(74)
    }
    expect(parts.join('')).toBe(line)
  })

  it('never splits multi-byte characters', () => {
    const line = `SUMMARY:${'ø'.repeat(100)}`
    const folded = foldIcalLine(line)

    expect(folded.replace(/\r\n /g, '')).toBe(line)
    for (const part of folded.split('\r\n ')) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75)
    }
  })
})

describe('ical feed', () => {
  it('renders events with the per-subscription alarm override', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await createSubscription(
      db,
      'u1',
      {
        name: 'Quarterly, Cloud',
        price: 4995,
        currency: 'DKK',
        cycleUnit: 'months',
        cycleCount: 3,
        nextPayment: new Date('2026-10-20T00:00:00.000Z'),
        notes: 'line one\nline two',
        remindDaysBefore: 30,
      },
      now,
    )

    const feed = await buildUserIcalFeed(db, 'u1', now)

    expect(feed.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(feed.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(feed).toContain('DTSTART;VALUE=DATE:20261020')
    expect(feed).toContain('TRIGGER:-P30D')
    expect(feed).toContain('SUMMARY:Quarterly\\, Cloud')
    expect(feed).toContain('DESCRIPTION:line one\\nline two')
    expect(feed.match(/BEGIN:VEVENT/g)?.length).toBe(4)
  })

  it('uses the user default and caps occurrences per subscription', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')
    await updateSettings(db, 'u1', { remindDaysBefore: 7 })
    await createSubscription(
      db,
      'u1',
      {
        name: 'Weekly Thing',
        price: 100,
        currency: 'DKK',
        cycleUnit: 'weeks',
        cycleCount: 1,
        nextPayment: new Date('2026-10-15T00:00:00.000Z'),
      },
      now,
    )

    const feed = await buildUserIcalFeed(db, 'u1', now)

    expect(feed).toContain('TRIGGER:-P7D')
    expect(feed.match(/BEGIN:VEVENT/g)?.length).toBe(24)
  })
})

describe('ical tokens', () => {
  it('enables idempotently, rotates, and disables', async () => {
    const { db } = createTestDb()
    await insertTestUser(db, 'u1')

    expect(await getIcalStatus(db, 'u1')).toEqual({
      enabled: false,
      token: null,
    })

    const first = await enableIcal(db, 'u1')
    expect(first.token).toHaveLength(32)
    expect((await enableIcal(db, 'u1')).token).toBe(first.token)

    const second = await rotateIcal(db, 'u1')
    expect(second.token).not.toBe(first.token)
    expect(await findUserIdByIcalToken(db, second.token)).toBe('u1')
    expect(await findUserIdByIcalToken(db, first.token)).toBeNull()
    expect(await findUserIdByIcalToken(db, 'short')).toBeNull()

    await disableIcal(db, 'u1')
    expect((await getIcalStatus(db, 'u1')).enabled).toBe(false)
    expect(await findUserIdByIcalToken(db, second.token)).toBeNull()
  })
})
