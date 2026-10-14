import { eq } from 'drizzle-orm'
import { userSetting } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export const weekStarts = ['monday', 'sunday'] as const
export type WeekStart = (typeof weekStarts)[number]

export const themes = ['light', 'dark', 'system'] as const
export type Theme = (typeof themes)[number]

export type Settings = {
  currency: string
  locale: string
  weekStart: WeekStart
  theme: Theme
  budgetAmountMinor: number | null
  payAnchorDay: number | null
  remindDaysBefore: number
  icalToken: string | null
}

export type SettingsPatch = {
  [Key in keyof Settings]?: Settings[Key] | null
}

export const defaultSettings: Settings = {
  currency: 'DKK',
  locale: 'en',
  weekStart: 'monday',
  theme: 'system',
  budgetAmountMinor: null,
  payAnchorDay: null,
  remindDaysBefore: 3,
  icalToken: null,
}

export async function getSettings(
  db: Database,
  userId: string,
): Promise<Settings> {
  const rows = await db
    .select()
    .from(userSetting)
    .where(eq(userSetting.userId, userId))
    .limit(1)

  const row = rows[0]
  if (!row) {
    return defaultSettings
  }

  return {
    currency: row.currency ?? defaultSettings.currency,
    locale: row.locale ?? defaultSettings.locale,
    weekStart: (row.weekStart as WeekStart | null) ?? defaultSettings.weekStart,
    theme: (row.theme as Theme | null) ?? defaultSettings.theme,
    budgetAmountMinor: row.budgetAmountMinor ?? null,
    payAnchorDay: row.payAnchorDay ?? null,
    remindDaysBefore: row.remindDaysBefore ?? defaultSettings.remindDaysBefore,
    icalToken: row.icalToken ?? null,
  }
}

export async function updateSettings(
  db: Database,
  userId: string,
  patch: SettingsPatch,
): Promise<Settings> {
  const rows = await db
    .select({ id: userSetting.id })
    .from(userSetting)
    .where(eq(userSetting.userId, userId))
    .limit(1)

  const changes = {
    ...(patch.currency !== undefined && { currency: patch.currency }),
    ...(patch.locale !== undefined && { locale: patch.locale }),
    ...(patch.weekStart !== undefined && { weekStart: patch.weekStart }),
    ...(patch.theme !== undefined && { theme: patch.theme }),
    ...(patch.budgetAmountMinor !== undefined && {
      budgetAmountMinor: patch.budgetAmountMinor,
    }),
    ...(patch.payAnchorDay !== undefined && {
      payAnchorDay: patch.payAnchorDay,
    }),
    ...(patch.remindDaysBefore !== undefined && {
      remindDaysBefore: patch.remindDaysBefore,
    }),
    ...(patch.icalToken !== undefined && { icalToken: patch.icalToken }),
  }

  if (rows[0]) {
    await db
      .update(userSetting)
      .set(changes)
      .where(eq(userSetting.userId, userId))
  } else {
    await db.insert(userSetting).values({
      id: crypto.randomUUID(),
      userId,
      ...changes,
      createdAt: new Date(),
    })
  }

  return getSettings(db, userId)
}
