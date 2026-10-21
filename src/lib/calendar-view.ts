import { formatMinor } from '@/lib/money'
import type { CalendarMonth } from '@/server/services/calendar'

const DAY_MS = 86_400_000

export type CalendarItem = {
  id: string
  name: string
  amountMinor: number
  currency: string
}

export type CalendarDay = {
  iso: string
  date: Date
  day: number
  inMonth: boolean
  isToday: boolean
  due: CalendarItem[]
  income: CalendarItem[]
  dueMinor: number
  incomeMinor: number
  netMinor: number
}

export type CalendarWeek = {
  start: Date
  end: Date
  days: CalendarDay[]
  eventDays: CalendarDay[]
  dueMinor: number
  incomeMinor: number
}

export type MonthModel = {
  calendar: CalendarMonth
  monthLabel: string
  monthName: string
  year: number
  daysInMonth: number
  days: CalendarDay[]
  grid: CalendarDay[]
  weeks: CalendarWeek[]
  eventDays: CalendarDay[]
  dueCount: number
  incomeCount: number
  netMinor: number
  isCurrentMonth: boolean
}

export type EventIndex = Map<
  string,
  { due: CalendarItem[]; income: CalendarItem[] }
>

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return formatMinor(amountMinor, currency, locale)
}

export function formatSignedMoney(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  const amount = formatMinor(amountMinor, currency, locale)
  return amountMinor > 0 ? `+${amount}` : amount
}

export function formatDayShort(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}

export function formatWeekday(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date)
}

export function formatWeekRange(
  start: Date,
  end: Date,
  locale: string,
): string {
  const format = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return `${format.format(start)} – ${format.format(end)}`
}

export function buildEventIndex(months: CalendarMonth[]): EventIndex {
  const index: EventIndex = new Map()

  function bucket(iso: string) {
    const current = index.get(iso) ?? { due: [], income: [] }
    index.set(iso, current)
    return current
  }

  for (const month of months) {
    for (const entry of month.entries) {
      bucket(isoOf(entry.date)).due.push({
        id: `${entry.subscriptionId}-${entry.date.getTime()}`,
        name: entry.name,
        amountMinor: entry.price,
        currency: entry.currency,
      })
    }
    for (const entry of month.income) {
      bucket(isoOf(entry.date)).income.push({
        id: `${entry.sourceId}-${entry.date.getTime()}`,
        name: entry.name,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
      })
    }
  }

  return index
}

function dayFrom(date: Date, inMonth: boolean, index: EventIndex): CalendarDay {
  const iso = isoOf(date)
  const bucket = index.get(iso) ?? { due: [], income: [] }
  const due = [...bucket.due].sort((a, b) => a.name.localeCompare(b.name))
  const income = [...bucket.income].sort((a, b) => a.name.localeCompare(b.name))
  const dueMinor = due.reduce((total, item) => total + item.amountMinor, 0)
  const incomeMinor = income.reduce(
    (total, item) => total + item.amountMinor,
    0,
  )

  return {
    iso,
    date,
    day: date.getUTCDate(),
    inMonth,
    isToday: iso === new Date().toISOString().slice(0, 10),
    due,
    income,
    dueMinor,
    incomeMinor,
    netMinor: incomeMinor - dueMinor,
  }
}

export function buildMonth(
  calendar: CalendarMonth,
  index: EventIndex,
): MonthModel {
  const { year, month, weekStart, locale } = calendar
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const weekStartIndex = weekStart === 'sunday' ? 0 : 1
  const offset = (firstDay.getUTCDay() - weekStartIndex + 7) % 7

  const days = Array.from({ length: daysInMonth }, (_, position) =>
    dayFrom(new Date(Date.UTC(year, month - 1, position + 1)), true, index),
  )

  const gridStart = new Date(Date.UTC(year, month - 1, 1 - offset))
  const grid = Array.from({ length: 42 }, (_, position) => {
    const date = new Date(gridStart.getTime() + position * DAY_MS)
    return dayFrom(date, date.getUTCMonth() === month - 1, index)
  })

  const weeks: CalendarWeek[] = []
  for (let position = 0; position < grid.length; position += 7) {
    const weekDays = grid.slice(position, position + 7)
    const eventDays = weekDays.filter(
      (day) => day.inMonth && (day.due.length > 0 || day.income.length > 0),
    )
    weeks.push({
      start: weekDays[0].date,
      end: weekDays[6].date,
      days: weekDays,
      eventDays,
      dueMinor: eventDays.reduce((total, day) => total + day.dueMinor, 0),
      incomeMinor: eventDays.reduce((total, day) => total + day.incomeMinor, 0),
    })
  }

  const eventDays = days.filter(
    (day) => day.due.length > 0 || day.income.length > 0,
  )
  const dueCount = days.reduce((total, day) => total + day.due.length, 0)
  const incomeCount = days.reduce((total, day) => total + day.income.length, 0)
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(firstDay)
  const monthName = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
  }).format(firstDay)

  return {
    calendar,
    monthLabel,
    monthName,
    year,
    daysInMonth,
    days,
    grid,
    weeks,
    eventDays,
    dueCount,
    incomeCount,
    netMinor: calendar.arrivingMinor - calendar.totalMinor,
    isCurrentMonth:
      firstDay.getUTCFullYear() === new Date().getUTCFullYear() &&
      firstDay.getUTCMonth() === new Date().getUTCMonth(),
  }
}

export function weekdayLabels(weekStart: string, locale: string): string[] {
  const start =
    weekStart === 'sunday'
      ? new Date(Date.UTC(2024, 0, 7))
      : new Date(Date.UTC(2024, 0, 1))
  return Array.from({ length: 7 }, (_, position) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(start.getTime() + position * DAY_MS)),
  )
}

export function largestDue(model: MonthModel): {
  item: CalendarItem
  day: CalendarDay
} | null {
  let largest: { item: CalendarItem; day: CalendarDay } | null = null
  for (const day of model.days) {
    for (const item of day.due) {
      if (!largest || item.amountMinor > largest.item.amountMinor) {
        largest = { item, day }
      }
    }
  }
  return largest
}

export type CalendarVariantProps = {
  calendar: CalendarMonth
  model: MonthModel
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  canPrev: boolean
  canNext: boolean
}
