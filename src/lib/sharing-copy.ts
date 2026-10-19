import type { useTranslations } from 'use-intl'

/** The typed translator for the sharing namespace, shared by the split UIs. */
export type SharingTranslator = ReturnType<typeof useTranslations<'sharing'>>

type SharingKey = Parameters<SharingTranslator>[0]

const UNIT_KEYS: Record<string, readonly [SharingKey, SharingKey]> = {
  days: ['unitDay', 'unitDays'],
  weeks: ['unitWeek', 'unitWeeks'],
  months: ['unitMonth', 'unitMonths'],
  years: ['unitYear', 'unitYears'],
}

/** "every month" / "every 3 months", with the unit word translated. */
export function cycleText(
  t: SharingTranslator,
  count: number,
  unit: string,
): string {
  const [one, many] = UNIT_KEYS[unit] ?? UNIT_KEYS.months
  return count === 1
    ? t('cycleEveryOne', { unit: t(one) })
    : t('cycleEveryMany', { count, unit: t(many) })
}

/** Maps server error codes onto the copy the split panels show. */
export function splitErrorText(caught: unknown, t: SharingTranslator): string {
  const message = caught instanceof Error ? caught.message : ''
  if (message.includes('OVER_ALLOCATED')) return t('errOverAllocated')
  if (message.includes('SHARES_EXCEED_PRICE')) return t('errSharesExceedPrice')
  return t('errGeneric')
}

/** A fair share for the next person: an even split of what is left. */
export function suggestedShare(
  price: number,
  allocated: number,
  count: number,
): number {
  const remaining = Math.max(0, price - allocated)
  return Math.max(0, Math.min(remaining, Math.round(price / (count + 2))))
}
