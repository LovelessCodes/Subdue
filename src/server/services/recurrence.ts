export const cycleUnits = ['days', 'weeks', 'months', 'years'] as const
export type CycleUnit = (typeof cycleUnits)[number]

export type Cycle = {
  count: number
  unit: CycleUnit
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function utcDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      MS_PER_DAY,
  )
}

export function occurrenceAt(anchor: Date, cycle: Cycle, index: number): Date {
  if (cycle.unit === 'days') {
    return new Date(anchor.getTime() + index * cycle.count * MS_PER_DAY)
  }

  if (cycle.unit === 'weeks') {
    return new Date(anchor.getTime() + index * cycle.count * 7 * MS_PER_DAY)
  }

  const monthsPerStep = cycle.unit === 'years' ? 12 : 1
  const anchorMonth = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth()
  const target = anchorMonth + monthsPerStep * cycle.count * index
  const year = Math.floor(target / 12)
  const month = ((target % 12) + 12) % 12
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, month))

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  )
}

function estimateIndex(anchor: Date, cycle: Cycle, date: Date): number {
  const elapsed = date.getTime() - anchor.getTime()
  let steps: number

  if (cycle.unit === 'days') {
    steps = elapsed / (MS_PER_DAY * cycle.count)
  } else if (cycle.unit === 'weeks') {
    steps = elapsed / (MS_PER_DAY * 7 * cycle.count)
  } else {
    const months =
      (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (date.getUTCMonth() - anchor.getUTCMonth())
    steps = months / (cycle.count * (cycle.unit === 'years' ? 12 : 1))
  }

  return Math.max(0, Math.floor(steps))
}

export function nextOccurrence(anchor: Date, cycle: Cycle, date: Date): Date {
  if (anchor.getTime() >= date.getTime()) {
    return anchor
  }

  let index = estimateIndex(anchor, cycle, date)

  while (occurrenceAt(anchor, cycle, index).getTime() < date.getTime()) {
    index += 1
  }

  while (
    index > 0 &&
    occurrenceAt(anchor, cycle, index - 1).getTime() >= date.getTime()
  ) {
    index -= 1
  }

  return occurrenceAt(anchor, cycle, index)
}

export function previousOccurrence(
  anchor: Date,
  cycle: Cycle,
  date: Date,
  floor?: Date | null,
): Date | null {
  if (floor) {
    if (floor.getTime() >= date.getTime()) {
      return null
    }
  } else if (anchor.getTime() >= date.getTime()) {
    return null
  }

  let index = estimateIndex(anchor, cycle, date)

  while (occurrenceAt(anchor, cycle, index).getTime() >= date.getTime()) {
    index -= 1
  }

  while (occurrenceAt(anchor, cycle, index + 1).getTime() < date.getTime()) {
    index += 1
  }

  if (index < 0 && !floor) {
    return null
  }

  const occurrence = occurrenceAt(anchor, cycle, index)
  return floor && occurrence.getTime() < floor.getTime() ? null : occurrence
}

/**
 * Occurrences in [from, to]. Without a floor the stream starts at the anchor
 * (index 0); with one it reaches backward through the anchor — every
 * occurrence at or after the floor counts, which lets a cadence describe
 * income that began before its next recorded payday.
 */
export function occurrencesBetween(
  anchor: Date,
  cycle: Cycle,
  from: Date,
  to: Date,
  floor?: Date | null,
): Date[] {
  const result: Date[] = []

  const lower = floor && floor.getTime() > from.getTime() ? floor : from
  if (to.getTime() < lower.getTime()) {
    return result
  }

  let index = estimateIndex(anchor, cycle, lower)

  while (
    (floor != null || index > 0) &&
    occurrenceAt(anchor, cycle, index - 1).getTime() >= lower.getTime()
  ) {
    index -= 1
  }

  let occurrence = occurrenceAt(anchor, cycle, index)

  while (occurrence.getTime() < lower.getTime()) {
    index += 1
    occurrence = occurrenceAt(anchor, cycle, index)
  }

  while (occurrence.getTime() <= to.getTime()) {
    result.push(occurrence)
    index += 1
    occurrence = occurrenceAt(anchor, cycle, index)
  }

  return result
}

/** Has a subscription's end date passed? A subscription ending today is live. */
export function hasEnded(end: Date | null | undefined, now: Date): boolean {
  return end != null && utcDayNumber(end) < utcDayNumber(now)
}

export function rolledNextPayment(stored: Date, cycle: Cycle, now: Date): Date {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  return nextOccurrence(stored, cycle, startOfToday)
}
