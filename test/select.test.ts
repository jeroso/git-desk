import { describe, it, expect } from 'vitest'
import { rangeBetween } from '../src/lib/select'

const items = ['a', 'b', 'c', 'd', 'e']

describe('rangeBetween', () => {
  it('returns the inclusive slice from anchor to target (forward)', () => {
    expect(rangeBetween(items, 'b', 'd')).toEqual(['b', 'c', 'd'])
  })

  it('works regardless of direction (target before anchor)', () => {
    expect(rangeBetween(items, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('returns a single item when anchor equals target', () => {
    expect(rangeBetween(items, 'c', 'c')).toEqual(['c'])
  })

  it('falls back to just the target when anchor is missing', () => {
    expect(rangeBetween(items, null, 'c')).toEqual(['c'])
    expect(rangeBetween(items, 'zzz', 'c')).toEqual(['c'])
  })

  it('returns empty when the target is not in the list', () => {
    expect(rangeBetween(items, 'a', 'zzz')).toEqual([])
  })
})
