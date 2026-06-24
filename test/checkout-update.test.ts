import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getLog } from '../electron/git/log'
import { currentBranch } from '../electron/git/branch'
import { updateBranch } from '../electron/git/remote'
import { smartCheckout } from '../electron/git/ops'
import { getStatus } from '../electron/git/status'

async function initRepo(dir: string) {
  await git(dir, ['init', '-q'])
  await git(dir, ['config', 'user.email', 'test@test.com'])
  await git(dir, ['config', 'user.name', 'test'])
  await git(dir, ['config', 'commit.gpgsign', 'false'])
}

describe('updateBranch (real git, determines currency itself)', () => {
  let remote: string
  let a: string // primary working repo
  let b: string // a second clone used to push commits to the remote

  beforeEach(async () => {
    remote = await mkdtemp(path.join(tmpdir(), 'gd-remote-'))
    a = await mkdtemp(path.join(tmpdir(), 'gd-a-'))
    b = await mkdtemp(path.join(tmpdir(), 'gd-b-'))
    await git(remote, ['init', '-q', '--bare', '-b', 'main'])

    await initRepo(a)
    await git(a, ['checkout', '-q', '-b', 'main'])
    await git(a, ['commit', '-q', '--allow-empty', '-m', 'c1'])
    await git(a, ['remote', 'add', 'origin', remote])
    await git(a, ['push', '-q', '-u', 'origin', 'main'])

    await initRepo(b)
    await git(b, ['remote', 'add', 'origin', remote])
    await git(b, ['fetch', '-q', 'origin'])
    await git(b, ['checkout', '-q', '-b', 'main', 'origin/main'])
  })

  afterEach(async () => {
    for (const d of [remote, a, b]) await rm(d, { recursive: true, force: true })
  })

  it('updates the CURRENT branch via pull, not "fetch <b>:<b>"', async () => {
    // remote main moves ahead (pushed from the other clone)
    await git(b, ['commit', '-q', '--allow-empty', '-m', 'c2'])
    await git(b, ['push', '-q', 'origin', 'main'])

    // a is on main: this must NOT throw "refusing to fetch into branch ... checked out"
    await updateBranch(a, 'main')

    expect((await getLog(a, 500, 'main')).map((c) => c.subject)).toContain('c2')
    expect(await currentBranch(a)).toBe('main')
  })

  it('updates a NON-current branch by fast-forwarding its ref without checkout', async () => {
    // a switches off main so main is no longer checked out
    await git(a, ['checkout', '-q', '-b', 'feature'])
    await git(b, ['commit', '-q', '--allow-empty', '-m', 'c3'])
    await git(b, ['push', '-q', 'origin', 'main'])

    await updateBranch(a, 'main')

    expect((await getLog(a, 500, 'main')).map((c) => c.subject)).toContain('c3')
    // still on feature — the local main ref advanced without a checkout
    expect(await currentBranch(a)).toBe('feature')
  })
})

describe('smartCheckout (git checkout -m)', () => {
  let repo: string

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'gd-sc-'))
    await initRepo(repo)
    await git(repo, ['checkout', '-q', '-b', 'main'])
  })

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  it('carries local changes onto the target branch when they merge cleanly', async () => {
    // foo has 10 lines on main; "other" edits line 1; local edits line 10 -> no overlap.
    const tenLines = (mark: (n: number) => string) =>
      Array.from({ length: 10 }, (_, i) => mark(i + 1)).join('\n') + '\n'
    await writeFile(path.join(repo, 'foo.txt'), tenLines((n) => `line${n}`))
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '-m', 'base'])

    await git(repo, ['checkout', '-q', '-b', 'other'])
    await writeFile(path.join(repo, 'foo.txt'), tenLines((n) => (n === 1 ? 'OTHER1' : `line${n}`)))
    await git(repo, ['commit', '-q', '-am', 'other edits line1'])

    await git(repo, ['checkout', '-q', 'main'])
    // uncommitted local edit on line 10
    await writeFile(path.join(repo, 'foo.txt'), tenLines((n) => (n === 10 ? 'LOCAL10' : `line${n}`)))

    const res = await smartCheckout(repo, 'other', false)
    expect(res.ok).toBe(true)
    expect(await currentBranch(repo)).toBe('other')
    const conflicted = (await getStatus(repo)).filter((c) => c.status === 'conflicted')
    expect(conflicted).toHaveLength(0)
  })

  it('switches to the target branch and leaves conflict markers when changes overlap', async () => {
    await writeFile(path.join(repo, 'foo.txt'), 'A\n')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '-m', 'base'])

    await git(repo, ['checkout', '-q', '-b', 'other'])
    await writeFile(path.join(repo, 'foo.txt'), 'OTHER\n')
    await git(repo, ['commit', '-q', '-am', 'other'])

    await git(repo, ['checkout', '-q', 'main'])
    await writeFile(path.join(repo, 'foo.txt'), 'LOCAL\n') // uncommitted, conflicts with other

    // plain checkout would be refused; smart checkout merges (with conflict) and does NOT throw.
    // Note: `git checkout -m` exits 0 even on conflict, so conflicts are detected via status,
    // not the exit code — this mirrors how merge/rebase conflicts are surfaced.
    await smartCheckout(repo, 'other', false)
    expect(await currentBranch(repo)).toBe('other')
    const conflicted = (await getStatus(repo)).filter((c) => c.status === 'conflicted').map((c) => c.path)
    expect(conflicted).toContain('foo.txt')
  })
})
