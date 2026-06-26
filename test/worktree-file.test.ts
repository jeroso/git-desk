import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { mergeBranch, markResolved } from '../electron/git/ops'
import { getStatus } from '../electron/git/status'
import { readWorktreeFile, writeWorktreeFile } from '../electron/git/worktreeFile'

let repo: string
let def: string

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-wt-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 't@t.com'])
  await git(repo, ['config', 'user.name', 't'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repo, 'f.txt'), 'base\n')
  await git(repo, ['add', '-A'])
  await git(repo, ['commit', '-q', '-m', 'base'])
  def = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  await git(repo, ['checkout', '-q', '-b', 'feat'])
  await writeFile(path.join(repo, 'f.txt'), 'feat-change\n')
  await git(repo, ['commit', '-aq', '-m', 'feat'])
  await git(repo, ['checkout', '-q', def])
  await writeFile(path.join(repo, 'f.txt'), 'main-change\n')
  await git(repo, ['commit', '-aq', '-m', 'main'])
})
afterEach(async () => { await rm(repo, { recursive: true, force: true }) })

describe('worktree file read/write around a conflict', () => {
  it('reads the conflicted file with markers, then writes a resolution that clears the conflict', async () => {
    const res = await mergeBranch(repo, 'feat')
    expect(res.ok).toBe(false) // conflict
    const raw = await readWorktreeFile(repo, 'f.txt')
    expect(raw).toContain('<<<<<<<')
    expect(raw).toContain('=======')
    expect(raw).toContain('>>>>>>>')

    await writeWorktreeFile(repo, 'f.txt', 'resolved\n')
    await markResolved(repo, ['f.txt'])
    const conflicted = (await getStatus(repo)).filter((s) => s.status === 'conflicted')
    expect(conflicted.length).toBe(0)
    expect(await readWorktreeFile(repo, 'f.txt')).toBe('resolved\n')
  })
})
