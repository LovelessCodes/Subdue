import { describe, expect, it } from 'vitest'
import {
  convertMinor,
  convertMinorUnits,
  ensureRates,
  minorUnitExponent,
  refreshRates,
  type Fetcher,
} from '@/server/services/currencies'
import { createTestDb } from '@/test/db'

function fakeFetch(payload: unknown, status = 200) {
  const calls: string[] = []
  const fetchFn: Fetcher = async (url) => {
    calls.push(url)
    return {
      ok: status < 400,
      status,
      json: async () => payload,
    }
  }
  return { fetchFn, calls }
}

const payload = {
  base: 'EUR',
  date: '2026-10-14',
  rates: { USD: 1.08, DKK: 7.46, JPY: 160 },
}

describe('currencies: refresh', () => {
  it('stores ECB rates with the reference date and prunes vanished quotes', async () => {
    const { db } = createTestDb()
    const first = fakeFetch(payload)
    const now = new Date('2026-10-14T12:00:00.000Z')

    await refreshRates(db, { fetchFn: first.fetchFn, now })

    const second = fakeFetch({ ...payload, rates: { USD: 1.09, DKK: 7.45 } })
    const rows = await refreshRates(db, {
      fetchFn: second.fetchFn,
      now: new Date('2026-10-15T12:00:00.000Z'),
    })

    expect(rows.map((row) => row.quote)).toEqual(['DKK', 'USD'])
    expect(rows.find((row) => row.quote === 'USD')?.rate).toBe(1.09)
    expect(rows.find((row) => row.quote === 'USD')?.rateDate).toEqual(
      new Date('2026-10-14T00:00:00.000Z'),
    )
  })

  it('fails loudly on a bad response', async () => {
    const { db } = createTestDb()
    const { fetchFn } = fakeFetch({}, 502)

    await expect(refreshRates(db, { fetchFn })).rejects.toThrow('502')
  })
})

describe('currencies: freshness', () => {
  it('does not refetch within the same day but does the next day', async () => {
    const { db } = createTestDb()
    const first = fakeFetch(payload)
    const today = new Date('2026-10-14T12:00:00.000Z')

    await ensureRates(db, { fetchFn: first.fetchFn, now: today })
    await ensureRates(db, { fetchFn: first.fetchFn, now: today })
    expect(first.calls).toHaveLength(1)

    const nextDay = fakeFetch({ ...payload, date: '2026-10-15' })
    await ensureRates(db, {
      fetchFn: nextDay.fetchFn,
      now: new Date('2026-10-15T08:00:00.000Z'),
    })
    expect(nextDay.calls).toHaveLength(1)
  })

  it('serves the stale cache when the network fails', async () => {
    const { db } = createTestDb()
    const good = fakeFetch(payload)
    await refreshRates(db, {
      fetchFn: good.fetchFn,
      now: new Date('2026-10-10T12:00:00.000Z'),
    })

    const broken = fakeFetch({}, 503)
    const result = await ensureRates(db, {
      fetchFn: broken.fetchFn,
      now: new Date('2026-10-14T12:00:00.000Z'),
    })

    expect(result.stale).toBe(true)
    expect(result.rows).toHaveLength(3)
  })

  it('throws when the network fails and nothing is cached', async () => {
    const { db } = createTestDb()
    const broken = fakeFetch({}, 503)

    await expect(ensureRates(db, { fetchFn: broken.fetchFn })).rejects.toThrow(
      '503',
    )
  })
})

describe('currencies: conversion', () => {
  it('converts across currencies using EUR crosses', async () => {
    const { db } = createTestDb()
    const { fetchFn } = fakeFetch(payload)
    const options = { fetchFn, now: new Date('2026-10-14T12:00:00.000Z') }

    const result = await convertMinor(
      db,
      { amount: 10000, from: 'DKK', to: 'USD' },
      options,
    )

    expect(result?.converted).toBe(1448)
    expect(result?.rate).toBeCloseTo(1.08 / 7.46, 10)
    expect(result?.rateDate).toEqual(new Date('2026-10-14T00:00:00.000Z'))
  })

  it('respects zero-decimal currencies like JPY', async () => {
    const { db } = createTestDb()
    const { fetchFn } = fakeFetch(payload)
    const options = { fetchFn, now: new Date('2026-10-14T12:00:00.000Z') }

    const result = await convertMinor(
      db,
      { amount: 1000, from: 'JPY', to: 'USD' },
      options,
    )

    expect(result?.converted).toBe(675)
  })

  it('short-circuits same-currency conversion without touching the network', async () => {
    const { db } = createTestDb()
    const { fetchFn, calls } = fakeFetch(payload)

    const result = await convertMinor(
      db,
      { amount: 500, from: 'EUR', to: 'EUR' },
      { fetchFn },
    )

    expect(result?.converted).toBe(500)
    expect(calls).toHaveLength(0)
  })

  it('returns null for a currency without a rate', async () => {
    const { db } = createTestDb()
    const { fetchFn } = fakeFetch(payload)
    const options = { fetchFn, now: new Date('2026-10-14T12:00:00.000Z') }

    const result = await convertMinor(
      db,
      { amount: 100, from: 'DKK', to: 'XXX' },
      options,
    )

    expect(result).toBeNull()
  })

  it('knows minor unit exponents', () => {
    expect(minorUnitExponent('DKK')).toBe(2)
    expect(minorUnitExponent('jpy')).toBe(0)
    expect(convertMinorUnits(1000, 1, 'JPY', 'USD')).toBe(100000)
    expect(convertMinorUnits(100000, 1, 'USD', 'JPY')).toBe(1000)
  })
})
