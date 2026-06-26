import { describe, it, expect } from 'vitest'
import { parseConflicts, buildMerged } from '../src/lib/mergeConflict'

const basic =
  'line1\n<<<<<<< HEAD\nour line\n=======\ntheir line\n>>>>>>> feature\nline2\n'

const diff3 =
  'a\n<<<<<<< HEAD\nours\n||||||| base\nbase line\n=======\ntheirs\n>>>>>>> branch\nb\n'

const multi =
  '<<<<<<< HEAD\no1\n=======\nt1\n>>>>>>> x\nmid\n<<<<<<< HEAD\no2\n=======\nt2\n>>>>>>> x\n'

describe('parseConflicts', () => {
  it('parses a basic conflict into shared + conflict segments with labels', () => {
    const p = parseConflicts(basic)
    expect(p.ok).toBe(true)
    expect(p.conflictCount).toBe(1)
    expect(p.oursLabel).toBe('HEAD')
    expect(p.theirsLabel).toBe('feature')
    expect(p.segments[0]).toEqual({ type: 'shared', lines: ['line1'] })
    expect(p.segments[1]).toEqual({ type: 'conflict', ours: ['our line'], theirs: ['their line'] })
    expect(p.segments[2]).toEqual({ type: 'shared', lines: ['line2', ''] })
  })
  it('captures the base section in diff3 style', () => {
    const p = parseConflicts(diff3)
    expect(p.ok).toBe(true)
    const c = p.segments.find((s) => s.type === 'conflict')
    expect(c).toEqual({ type: 'conflict', ours: ['ours'], theirs: ['theirs'], base: ['base line'] })
  })
  it('counts multiple conflict hunks', () => {
    const p = parseConflicts(multi)
    expect(p.ok).toBe(true)
    expect(p.conflictCount).toBe(2)
  })
  it('returns ok:false when there are no markers', () => {
    expect(parseConflicts('just\nplain\ntext\n').ok).toBe(false)
  })
  it('returns ok:false for an unbalanced (unclosed) conflict', () => {
    expect(parseConflicts('<<<<<<< HEAD\nours\n=======\ntheirs\n').ok).toBe(false)
  })
})

describe('buildMerged', () => {
  it('rebuilds the file from per-conflict resolutions (preserving newlines)', () => {
    const p = parseConflicts(basic)
    expect(buildMerged(p.segments, ['our line'])).toBe('line1\nour line\nline2\n')
    expect(buildMerged(p.segments, ['our line\ntheir line'])).toBe('line1\nour line\ntheir line\nline2\n')
  })
  it('treats an empty resolution as deleting the hunk', () => {
    const p = parseConflicts(basic)
    expect(buildMerged(p.segments, [''])).toBe('line1\nline2\n')
  })
})
