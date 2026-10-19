import { describe, expect, it } from 'vitest'
import { nextPath } from './next-path'

describe('nextPath', () => {
  it('returns a same-origin path', () => {
    expect(nextPath('?next=%2Fshare%2Fabc')).toBe('/share/abc')
    expect(nextPath('sig=1&next=/settings')).toBe('/settings')
  })

  it('refuses anything that could leave the site', () => {
    expect(nextPath('?next=https%3A%2F%2Fevil.example')).toBeNull()
    expect(nextPath('?next=%2F%2Fevil.example')).toBeNull()
    expect(nextPath('?next=javascript%3Aalert(1)')).toBeNull()
    expect(nextPath('')).toBeNull()
    expect(nextPath('?other=1')).toBeNull()
  })
})
