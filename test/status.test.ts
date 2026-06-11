import { describe, it, expect } from 'vitest'
import { parseStatus } from '../electron/git/status'

const NUL = '\x00'

describe('parseStatus', () => {
  it('parses staged modification', () => {
    const out = `M  src/a.ts${NUL}`
    expect(parseStatus(out)).toEqual([
      { path: 'src/a.ts', status: 'modified', staged: true },
    ])
  })

  it('parses unstaged modification', () => {
    const out = ` M src/a.ts${NUL}`
    expect(parseStatus(out)).toEqual([
      { path: 'src/a.ts', status: 'modified', staged: false },
    ])
  })

  it('parses added, deleted, untracked', () => {
    const out = `A  new.ts${NUL}D  gone.ts${NUL}?? scratch.txt${NUL}`
    expect(parseStatus(out)).toEqual([
      { path: 'new.ts', status: 'added', staged: true },
      { path: 'gone.ts', status: 'deleted', staged: true },
      { path: 'scratch.txt', status: 'untracked', staged: false },
    ])
  })

  it('parses conflicts (UU)', () => {
    const out = `UU conflict.ts${NUL}`
    expect(parseStatus(out)).toEqual([
      { path: 'conflict.ts', status: 'conflicted', staged: false },
    ])
  })

  it('parses rename with old path', () => {
    const out = `R  new.ts${NUL}old.ts${NUL}`
    expect(parseStatus(out)).toEqual([
      { path: 'new.ts', oldPath: 'old.ts', status: 'renamed', staged: true },
    ])
  })
})
