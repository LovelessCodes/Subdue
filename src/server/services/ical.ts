import { eq } from 'drizzle-orm'
import { userSetting } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'
import { formatMinor, toIsoDay } from '../../lib/money'
import { occurrencesBetween, type CycleUnit } from './recurrence'
import { getSettings, updateSettings, type Settings } from './settings'
import {
  listSubscriptions,
  type SubscriptionWithRecurrence,
} from './subscriptions'

export const FEED_MONTHS = 12
export const MAX_OCCURRENCES_PER_SUBSCRIPTION = 24

export function generateIcalToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function foldIcalLine(line: string): string {
  const result: string[] = []
  let current = ''
  let bytes = 0

  for (const char of line) {
    const limit = result.length === 0 ? 75 : 74
    const charBytes = Buffer.byteLength(char, 'utf8')
    if (bytes + charBytes > limit) {
      result.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += charBytes
  }

  result.push(current)
  return result.join('\r\n ')
}

export type IcalEvent = {
  uid: string
  date: Date
  summary: string
  description: string | null
  alarmDaysBefore: number
}

export function buildIcalEvents(
  subscriptions: SubscriptionWithRecurrence[],
  settings: Settings,
  now: Date,
): IcalEvent[] {
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const to = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + FEED_MONTHS,
      from.getUTCDate(),
    ),
  )

  const events: IcalEvent[] = []

  for (const subscription of subscriptions) {
    const cycle = {
      count: subscription.cycleCount,
      unit: subscription.cycleUnit as CycleUnit,
    }
    const occurrences = occurrencesBetween(
      subscription.nextPayment,
      cycle,
      from,
      to,
    ).slice(0, MAX_OCCURRENCES_PER_SUBSCRIPTION)

    for (const occurrence of occurrences) {
      events.push({
        uid: `${subscription.id}-${toIsoDay(occurrence).replace(/-/g, '')}@subdue`,
        date: occurrence,
        summary: `${subscription.name} — ${formatMinor(subscription.price, subscription.currency, settings.locale)}`,
        description: subscription.notes,
        alarmDaysBefore:
          subscription.remindDaysBefore ?? settings.remindDaysBefore,
      })
    }
  }

  return events
}

export function renderIcal(
  events: IcalEvent[],
  options: { now: Date; name?: string },
): string {
  const stamp = `${toIsoDay(options.now).replace(/-/g, '')}T000000Z`
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Subdue//Subscription tracker//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcalText(options.name ?? 'Subdue')}`,
  ]

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIsoDay(event.date).replace(/-/g, '')}`,
      `SUMMARY:${escapeIcalText(event.summary)}`,
    )
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcalText(event.description)}`)
    }
    if (event.alarmDaysBefore > 0) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-P${event.alarmDaysBefore}D`,
        'DESCRIPTION:Subscription due',
        'END:VALARM',
      )
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return `${lines.map(foldIcalLine).join('\r\n')}\r\n`
}

export async function getIcalStatus(
  db: Database,
  userId: string,
): Promise<{ enabled: boolean; token: string | null }> {
  const settings = await getSettings(db, userId)
  return { enabled: settings.icalToken !== null, token: settings.icalToken }
}

export async function enableIcal(
  db: Database,
  userId: string,
): Promise<{ token: string }> {
  const settings = await getSettings(db, userId)
  if (settings.icalToken) {
    return { token: settings.icalToken }
  }
  const token = generateIcalToken()
  await updateSettings(db, userId, { icalToken: token })
  return { token }
}

export async function rotateIcal(
  db: Database,
  userId: string,
): Promise<{ token: string }> {
  const token = generateIcalToken()
  await updateSettings(db, userId, { icalToken: token })
  return { token }
}

export async function disableIcal(db: Database, userId: string): Promise<void> {
  await updateSettings(db, userId, { icalToken: null })
}

export async function findUserIdByIcalToken(
  db: Database,
  token: string,
): Promise<string | null> {
  if (token.length < 16) {
    return null
  }
  const rows = await db
    .select({ userId: userSetting.userId })
    .from(userSetting)
    .where(eq(userSetting.icalToken, token))
    .limit(1)
  return rows[0]?.userId ?? null
}

export async function buildUserIcalFeed(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<string> {
  const settings = await getSettings(db, userId)
  const page = await listSubscriptions(
    db,
    userId,
    { limit: 100, offset: 0, sort: 'next-payment', order: 'asc' },
    now,
  )
  const events = buildIcalEvents(page.items, settings, now)
  return renderIcal(events, { now })
}
