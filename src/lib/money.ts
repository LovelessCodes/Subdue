const ZERO_DECIMAL_CURRENCIES = new Set(['ISK', 'JPY', 'KRW'])

export function minorUnitExponent(code: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(code.toUpperCase()) ? 0 : 2
}

export function convertMinorUnits(
  amount: number,
  rate: number,
  from: string,
  to: string,
): number {
  const scaled =
    amount * rate * 10 ** (minorUnitExponent(to) - minorUnitExponent(from))
  return Math.round(scaled)
}

export function formatMinor(
  amountMinor: number,
  code: string,
  locale = 'en',
): string {
  const exponent = minorUnitExponent(code)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(amountMinor / 10 ** exponent)
}

export function formatDate(date: Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function fromIsoDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

export function toMajorUnits(amountMinor: number, code: string): number {
  return amountMinor / 10 ** minorUnitExponent(code)
}

export function fromMajorUnits(amount: number, code: string): number {
  return Math.round(amount * 10 ** minorUnitExponent(code))
}
