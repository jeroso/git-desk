import { describe, it, expect } from 'vitest'
import { parseLog, LOG_FORMAT } from '../electron/git/log'

const SEP = '\x00'
const REC = '\x1e'

function rec(fields: string[]) {
  return fields.join(SEP) + REC
}

describe('parseLog', () => {
  it('parses a single commit', () => {
    const raw = rec(['aaa', 'bbb', 'yw', '2026-06-01T10:00:00+09:00', 'Fix bug', 'HEAD -> main'])
    const commits = parseLog(raw)
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      hash: 'aaa',
      parents: ['bbb'],
      author: 'yw',
      dateISO: '2026-06-01T10:00:00+09:00',
      subject: 'Fix bug',
      refs: ['HEAD -> main'],
    })
  })

  it('parses merge commit with two parents and no refs', () => {
    const raw = rec(['m1', 'p1 p2', 'yw', '2026-06-01T10:00:00+09:00', 'Merge', ''])
    const commits = parseLog(raw)
    expect(commits[0].parents).toEqual(['p1', 'p2'])
    expect(commits[0].refs).toEqual([])
  })

  it('parses root commit with no parents', () => {
    const raw = rec(['r1', '', 'yw', '2026-06-01T10:00:00+09:00', 'init', ''])
    expect(parseLog(raw)[0].parents).toEqual([])
  })

  it('splits multiple refs and trims', () => {
    const raw = rec(['a', 'b', 'yw', 'd', 's', 'HEAD -> main, origin/main, tag: v1'])
    expect(parseLog(raw)[0].refs).toEqual(['HEAD -> main', 'origin/main', 'tag: v1'])
  })

  it('exposes LOG_FORMAT containing field separators', () => {
    expect(LOG_FORMAT).toContain(SEP)
    expect(LOG_FORMAT).toContain(REC)
  })
})
