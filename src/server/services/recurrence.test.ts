import { describe, expect, it } from 'vitest'
import {
  hasEnded,
  isOverdue,
  nextOccurrence,
  occurrenceAt,
  occurrencesBetween,
  previousOccurrence,
  rolledNextPayment,
  type Cycle,
} from '@/server/services/recurrence'

function utc(year: number, month: number, day: number, hours = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hours))
}

describe('recurrence: occurrenceAt', () => {
  it('adds day and week cycles with plain arithmetic', () => {
    const anchor = utc(2026, 1, 31, 9)

    expect(occurrenceAt(anchor, { count: 10, unit: 'days' }, 1)).toEqual(
      utc(2026, 2, 10, 9),
    )
    expect(occurrenceAt(anchor, { count: 10, unit: 'days' }, 3)).toEqual(
      utc(2026, 3, 2, 9),
    )
    expect(occurrenceAt(anchor, { count: 2, unit: 'weeks' }, 2)).toEqual(
      utc(2026, 2, 28, 9),
    )
  })

  it('clamps to the end of short months but keeps the anchor day', () => {
    const anchor = utc(2026, 1, 31)

    expect(occurrenceAt(anchor, { count: 1, unit: 'months' }, 1)).toEqual(
      utc(2026, 2, 28),
    )
    expect(occurrenceAt(anchor, { count: 1, unit: 'months' }, 2)).toEqual(
      utc(2026, 3, 31),
    )
    expect(occurrenceAt(anchor, { count: 1, unit: 'months' }, 3)).toEqual(
      utc(2026, 4, 30),
    )
  })

  it('handles leap years for both February and February 29 anchors', () => {
    expect(
      occurrenceAt(utc(2028, 1, 31), { count: 1, unit: 'months' }, 1),
    ).toEqual(utc(2028, 2, 29))

    const leapDay = utc(2024, 2, 29)
    expect(occurrenceAt(leapDay, { count: 1, unit: 'years' }, 1)).toEqual(
      utc(2025, 2, 28),
    )
    expect(occurrenceAt(leapDay, { count: 1, unit: 'years' }, 4)).toEqual(
      utc(2028, 2, 29),
    )
  })

  it('keeps the anniversary for multi-month cycles', () => {
    const anchor = utc(2026, 1, 31)
    const quarterly: Cycle = { count: 3, unit: 'months' }

    expect(occurrenceAt(anchor, quarterly, 1)).toEqual(utc(2026, 4, 30))
    expect(occurrenceAt(anchor, quarterly, 2)).toEqual(utc(2026, 7, 31))
  })

  it('wraps across year boundaries', () => {
    const anchor = utc(2026, 11, 30)

    expect(occurrenceAt(anchor, { count: 1, unit: 'months' }, 2)).toEqual(
      utc(2027, 1, 30),
    )
  })
})

describe('recurrence: nextOccurrence', () => {
  it('returns the anchor itself when the reference is not after it', () => {
    const anchor = utc(2026, 5, 1)

    expect(
      nextOccurrence(anchor, { count: 1, unit: 'months' }, anchor),
    ).toEqual(anchor)
    expect(
      nextOccurrence(anchor, { count: 1, unit: 'months' }, utc(2026, 4, 1)),
    ).toEqual(anchor)
  })

  it('finds the first occurrence on or after the reference date', () => {
    const anchor = utc(2026, 1, 31)
    const monthly: Cycle = { count: 1, unit: 'months' }

    expect(nextOccurrence(anchor, monthly, utc(2026, 2, 1))).toEqual(
      utc(2026, 2, 28),
    )
    expect(nextOccurrence(anchor, monthly, utc(2026, 2, 28))).toEqual(
      utc(2026, 2, 28),
    )
    expect(nextOccurrence(anchor, monthly, utc(2026, 3, 1))).toEqual(
      utc(2026, 3, 31),
    )
  })
})

describe('recurrence: previousOccurrence', () => {
  it('returns null before the first occurrence', () => {
    const anchor = utc(2026, 5, 1)

    expect(
      previousOccurrence(anchor, { count: 1, unit: 'months' }, anchor),
    ).toBeNull()
  })

  it('finds the last occurrence strictly before the reference date', () => {
    const anchor = utc(2026, 1, 31)
    const monthly: Cycle = { count: 1, unit: 'months' }

    expect(previousOccurrence(anchor, monthly, utc(2026, 3, 15))).toEqual(
      utc(2026, 2, 28),
    )
    expect(previousOccurrence(anchor, monthly, utc(2026, 2, 28))).toEqual(
      utc(2026, 1, 31),
    )
    expect(previousOccurrence(anchor, monthly, utc(2026, 4, 1))).toEqual(
      utc(2026, 3, 31),
    )
  })

  it('with a floor it reaches back past the anchor, but never before the floor', () => {
    const anchor = utc(2026, 11, 15)
    const quarterly: Cycle = { count: 3, unit: 'months' }

    expect(
      previousOccurrence(anchor, quarterly, utc(2026, 10, 1), utc(2026, 8, 15)),
    ).toEqual(utc(2026, 8, 15))
    expect(
      previousOccurrence(anchor, quarterly, utc(2026, 10, 1), utc(2026, 9, 1)),
    ).toBeNull()
    expect(previousOccurrence(anchor, quarterly, utc(2026, 10, 1))).toBeNull()
  })
})

describe('recurrence: occurrencesBetween', () => {
  it('returns inclusive occurrences inside the window', () => {
    const anchor = utc(2026, 1, 15)
    const monthly: Cycle = { count: 1, unit: 'months' }

    expect(
      occurrencesBetween(anchor, monthly, utc(2026, 2, 15), utc(2026, 5, 15)),
    ).toEqual([
      utc(2026, 2, 15),
      utc(2026, 3, 15),
      utc(2026, 4, 15),
      utc(2026, 5, 15),
    ])
  })

  it('is empty when the window ends before the anchor', () => {
    const anchor = utc(2026, 5, 1)

    expect(
      occurrencesBetween(
        anchor,
        { count: 1, unit: 'weeks' },
        utc(2026, 1, 1),
        utc(2026, 4, 1),
      ),
    ).toEqual([])
  })

  it('with a floor it also lists the occurrences before the anchor', () => {
    const anchor = utc(2026, 11, 1)
    const monthly: Cycle = { count: 1, unit: 'months' }
    const floor = utc(2026, 10, 1)

    expect(
      occurrencesBetween(
        anchor,
        monthly,
        utc(2026, 10, 1),
        utc(2026, 10, 31),
        floor,
      ),
    ).toEqual([utc(2026, 10, 1)])
    expect(
      occurrencesBetween(anchor, monthly, utc(2026, 10, 1), utc(2026, 10, 31)),
    ).toEqual([])
    // The floor does not force pre-window pays in: it is a limit, not a seed.
    expect(
      occurrencesBetween(
        anchor,
        monthly,
        utc(2026, 10, 2),
        utc(2026, 11, 2),
        floor,
      ),
    ).toEqual([utc(2026, 11, 1)])
  })
})

describe('recurrence: overdue and roll-forward', () => {
  it('a payment due today is not overdue yet', () => {
    expect(isOverdue(utc(2026, 10, 14), utc(2026, 10, 14, 18))).toBe(false)
    expect(isOverdue(utc(2026, 10, 13), utc(2026, 10, 14, 1))).toBe(true)
  })

  it('rolls a stale next payment forward to the first due date from today', () => {
    const monthly: Cycle = { count: 1, unit: 'months' }

    expect(
      rolledNextPayment(utc(2026, 8, 1), monthly, utc(2026, 10, 14)),
    ).toEqual(utc(2026, 11, 1))
    expect(
      rolledNextPayment(utc(2026, 8, 1), monthly, utc(2026, 11, 1)),
    ).toEqual(utc(2026, 11, 1))
    expect(
      rolledNextPayment(utc(2026, 12, 1), monthly, utc(2026, 10, 14)),
    ).toEqual(utc(2026, 12, 1))
  })
})

describe('recurrence: end dates', () => {
  it('a subscription ending today is still live', () => {
    expect(hasEnded(utc(2026, 10, 14), utc(2026, 10, 14, 18))).toBe(false)
    expect(hasEnded(utc(2026, 10, 13), utc(2026, 10, 14, 1))).toBe(true)
    expect(hasEnded(null, utc(2026, 10, 14))).toBe(false)
    expect(hasEnded(undefined, utc(2026, 10, 14))).toBe(false)
  })
})
