import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from '@/lib/csv'

describe('csv', () => {
  it('round-trips awkward values', () => {
    const rows = [
      ['name', 'notes'],
      ['Plain', 'simple'],
      ['Comma, Inc', 'line one\nline two'],
      ['Quote "Co"', 'trailing space '],
    ]

    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('parses CRLF input and escaped quotes', () => {
    expect(parseCsv('a,b\r\n"x""y",z\r\n')).toEqual([
      ['a', 'b'],
      ['x"y', 'z'],
    ])
  })

  it('drops trailing blank lines only', () => {
    expect(parseCsv('a\n')).toEqual([['a']])
    expect(parseCsv('a\n\n\n')).toEqual([['a']])
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], [''], ['b']])
  })

  it('quotes only when needed', () => {
    expect(toCsv([['a', 'b,c']])).toBe('a,"b,c"\n')
    expect(toCsv([['a', 'say "hi"']])).toBe('a,"say ""hi"""\n')
  })
})
