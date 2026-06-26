import { describe, it, expect } from 'vitest'
import type { Commit } from '../src/types'
import {
  headHash, isOnCurrentBranch, isContiguousFromHead, isContiguousRange,
  orderedOldestToNewest, orderedNewestToOldest,
} from '../src/lib/commitSelection'

function mk(hash: string, parents: string[], refs: string[] = []): Commit {
  return { hash, parents, refs, author: '', dateISO: '', subject: '' }
}
// newest→oldest. main: c→b→a. side: x→a (feature).
const commits: Commit[] = [
  mk('c', ['b'], ['HEAD -> main']),
  mk('x', ['a'], ['feature']),
  mk('b', ['a']),
  mk('a', []),
]
const S = (...h: string[]) => new Set(h)

describe('headHash', () => {
  it('finds the HEAD commit', () => expect(headHash(commits)).toBe('c'))
  it('returns null when no HEAD ref', () => expect(headHash([mk('z', [])])).toBeNull())
})
describe('headHash edge cases', () => {
  it('does not treat origin/HEAD as the local HEAD', () => {
    expect(headHash([mk('z', [], ['origin/HEAD', 'origin/main'])])).toBeNull()
  })
  it('matches a detached bare HEAD ref', () => {
    expect(headHash([mk('z', [], ['HEAD'])])).toBe('z')
  })
})
describe('isOnCurrentBranch', () => {
  it('true for first-parent ancestors of HEAD', () => {
    expect(isOnCurrentBranch(commits, S('a'))).toBe(true)
    expect(isOnCurrentBranch(commits, S('b', 'c'))).toBe(true)
  })
  it('false for a commit off the current branch', () => {
    expect(isOnCurrentBranch(commits, S('x'))).toBe(false)
  })
})
describe('isContiguousFromHead', () => {
  it('true for a contiguous tip including HEAD', () => {
    expect(isContiguousFromHead(commits, S('c'))).toBe(true)
    expect(isContiguousFromHead(commits, S('c', 'b'))).toBe(true)
  })
  it('false when HEAD not selected or there is a gap', () => {
    expect(isContiguousFromHead(commits, S('b'))).toBe(false)
    expect(isContiguousFromHead(commits, S('c', 'a'))).toBe(false)
  })
})
describe('isContiguousRange', () => {
  it('true for a linear contiguous selection of 2+', () => {
    expect(isContiguousRange(commits, S('b', 'c'))).toBe(true)
    expect(isContiguousRange(commits, S('a', 'b', 'c'))).toBe(true)
  })
  it('false for gaps or single selection', () => {
    expect(isContiguousRange(commits, S('a', 'c'))).toBe(false)
    expect(isContiguousRange(commits, S('c'))).toBe(false)
  })
})
describe('ordering helpers', () => {
  it('orders oldest→newest and newest→oldest', () => {
    expect(orderedOldestToNewest(commits, S('b', 'c'))).toEqual(['b', 'c'])
    expect(orderedNewestToOldest(commits, S('b', 'c'))).toEqual(['c', 'b'])
  })
})
describe('selection predicate edge cases', () => {
  it('isContiguousRange is false when a merge commit is on the newer side', () => {
    const merged: Commit[] = [
      mk('m', ['b', 'x'], ['HEAD -> main']),
      mk('b', ['a']),
      mk('x', ['a']),
      mk('a', []),
    ]
    expect(isContiguousRange(merged, S('m', 'b'))).toBe(false)
  })
  it('isOnCurrentBranch is false for a mixed on/off-branch selection', () => {
    expect(isOnCurrentBranch(commits, S('b', 'x'))).toBe(false)
  })
})
