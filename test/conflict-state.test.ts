import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { mergeBranch, abortOp } from '../electron/git/ops'
import { getConflictState } from '../electron/git/conflictState'

let repo: string
let def: string

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-cs-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 't@t.com'])
  await git(repo, ['config', 'user.name', 't'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repo, 'f.txt'), 'base\n')
  await git(repo, ['add', '-A']); await git(repo, ['commit', '-q', '-m', 'base'])
  def = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  await git(repo, ['checkout', '-q', '-b', 'feat'])
  await writeFile(path.join(repo, 'f.txt'), 'feat\n'); await git(repo, ['commit', '-aq', '-m', 'feat'])
  await git(repo, ['checkout', '-q', def])
  await writeFile(path.join(repo, 'f.txt'), 'main\n'); await git(repo, ['commit', '-aq', '-m', 'main'])
})
afterEach(async () => { await rm(repo, { recursive: true, force: true }) })

describe('getConflictState', () => {
  it('reports a clean repo as not in progress', async () => {
    const s = await getConflictState(repo)
    expect(s).toEqual({ inProgress: false, op: null, files: [] })
  })
  it('detects an in-progress merge conflict with files', async () => {
    await mergeBranch(repo, 'feat')
    const s = await getConflictState(repo)
    expect(s.inProgress).toBe(true)
    expect(s.op).toBe('merge')
    expect(s.files).toContain('f.txt')
  })
  it('clears after abort', async () => {
    await mergeBranch(repo, 'feat')
    await abortOp(repo, 'merge')
    const s = await getConflictState(repo)
    expect(s.inProgress).toBe(false)
    expect(s.op).toBeNull()
  })
})
