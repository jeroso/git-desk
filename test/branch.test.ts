import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getLog } from '../electron/git/log'
import { getBranches, createBranch, deleteBranch } from '../electron/git/branch'

// Real-git integration tests guarding two argv-level bugs that string parsers miss:
//  1. `git log <ref>` is ambiguous when a branch name collides with a path.
//  2. deleteBranch must use the caller's isRemote flag, NOT a "/" heuristic, because
//     local branch names legitimately contain slashes (e.g. "feat/ITS-4145-temp").

let repo: string

async function commitEmpty(msg: string) {
  await git(repo, ['commit', '-q', '--allow-empty', '-m', msg])
}

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-branch-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 'test@test.com'])
  await git(repo, ['config', 'user.name', 'test'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await commitEmpty('init')
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('getLog with a ref that collides with a path name', () => {
  it('does not throw "ambiguous argument" when a branch and a path share a name', async () => {
    // A "test" branch AND a "test" directory in the worktree — exactly the collision
    // that broke double-clicking the branch in the real app.
    await git(repo, ['branch', 'test'])
    await mkdir(path.join(repo, 'test'), { recursive: true })
    await writeFile(path.join(repo, 'test', 'a.txt'), 'x')

    const commits = await getLog(repo, 500, 'test')
    expect(commits.map((c) => c.subject)).toContain('init')
  })
})

describe('deleteBranch (real git)', () => {
  it('deletes a LOCAL branch whose name contains a slash', async () => {
    await createBranch(repo, 'feat/ITS-4145-temp', undefined, false)
    expect((await getBranches(repo)).map((b) => b.name)).toContain('feat/ITS-4145-temp')

    // isRemote = false: must run `git branch -d`, NOT `git push feat --delete ...`.
    await deleteBranch(repo, 'feat/ITS-4145-temp', false, false)

    expect((await getBranches(repo)).map((b) => b.name)).not.toContain('feat/ITS-4145-temp')
  })

  it('force-deletes an unmerged local branch with a slash when force=true', async () => {
    await createBranch(repo, 'feat/unmerged', undefined, true)
    await commitEmpty('only-on-feat')
    await git(repo, ['checkout', '-q', '-'])

    // A plain -d would fail ("not fully merged"); force uses -D.
    await deleteBranch(repo, 'feat/unmerged', false, true)
    expect((await getBranches(repo)).map((b) => b.name)).not.toContain('feat/unmerged')
  })

  it('deletes a REMOTE-tracking branch on its remote, splitting off the remote name', async () => {
    const remote = await mkdtemp(path.join(tmpdir(), 'gitdesk-remote-'))
    try {
      await git(remote, ['init', '-q', '--bare'])
      await git(repo, ['remote', 'add', 'origin', remote])
      // Push a branch whose own name also contains a slash, to verify only the
      // FIRST segment is treated as the remote: origin/feature/x -> remote=origin, branch=feature/x
      await git(repo, ['branch', 'feature/x'])
      await git(repo, ['push', '-q', 'origin', 'feature/x'])
      expect(await git(repo, ['ls-remote', '--heads', 'origin', 'feature/x'])).toContain('feature/x')

      await deleteBranch(repo, 'origin/feature/x', true, false)

      expect(await git(repo, ['ls-remote', '--heads', 'origin', 'feature/x'])).toBe('')
    } finally {
      await rm(remote, { recursive: true, force: true })
    }
  })
})
