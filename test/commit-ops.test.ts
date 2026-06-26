import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getStatus } from '../electron/git/status'
import { resetTo, undoCommit, revertCommits, isPushed } from '../electron/git/ops'

let repo: string

async function commitFile(name: string, msg: string) {
  await writeFile(path.join(repo, name), `${name} content\n`)
  await git(repo, ['add', '--', name])
  await git(repo, ['commit', '-q', '-m', msg])
}
const rev = async (ref: string) => (await git(repo, ['rev-parse', ref])).trim()

let A: string, B: string, C: string

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-ops-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 'test@test.com'])
  await git(repo, ['config', 'user.name', 'test'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await git(repo, ['commit', '-q', '--allow-empty', '-m', 'init'])
  await commitFile('a.txt', 'A'); A = await rev('HEAD')
  await commitFile('b.txt', 'B'); B = await rev('HEAD')
  await commitFile('c.txt', 'C'); C = await rev('HEAD')
})
afterEach(async () => { await rm(repo, { recursive: true, force: true }) })

describe('exec git() env option', () => {
  it('passes env vars through to git', async () => {
    const out = await git(repo, ['var', 'GIT_AUTHOR_IDENT'], {
      env: { GIT_AUTHOR_NAME: 'EnvPerson', GIT_AUTHOR_EMAIL: 'env@example.com' },
    })
    expect(out).toContain('EnvPerson <env@example.com>')
  })
})

describe('resetTo', () => {
  it('soft: moves HEAD, keeps changes staged', async () => {
    await resetTo(repo, A, 'soft')
    expect(await rev('HEAD')).toBe(A)
    const staged = await git(repo, ['diff', '--cached', '--name-only'])
    expect(staged).toContain('b.txt')
    expect(staged).toContain('c.txt')
  })
  it('mixed: moves HEAD, unstages but keeps worktree files', async () => {
    await resetTo(repo, A, 'mixed')
    expect(await rev('HEAD')).toBe(A)
    expect(await git(repo, ['diff', '--cached', '--name-only'])).toBe('')
    const paths = (await getStatus(repo)).map((s) => s.path)
    expect(paths).toEqual(expect.arrayContaining(['b.txt', 'c.txt']))
  })
  it('hard: moves HEAD and discards changes', async () => {
    await resetTo(repo, A, 'hard')
    expect(await rev('HEAD')).toBe(A)
    expect((await getStatus(repo)).length).toBe(0)
  })
})

describe('undoCommit', () => {
  it('undoes the tip commit, keeping its changes staged', async () => {
    await undoCommit(repo, C)
    expect(await rev('HEAD')).toBe(B)
    expect(await git(repo, ['diff', '--cached', '--name-only'])).toContain('c.txt')
  })
})

describe('revertCommits', () => {
  it('reverts a single commit, removing its file', async () => {
    const res = await revertCommits(repo, [C])
    expect(res.ok).toBe(true)
    const exists = await git(repo, ['cat-file', '-e', 'HEAD:c.txt']).then(() => 'exists').catch(() => 'missing')
    expect(exists).toBe('missing')
  })
  it('reverts multiple commits (newest→oldest)', async () => {
    const res = await revertCommits(repo, [C, B])
    expect(res.ok).toBe(true)
    const tree = await git(repo, ['ls-tree', '-r', '--name-only', 'HEAD'])
    expect(tree).toContain('a.txt')
    expect(tree).not.toContain('b.txt')
    expect(tree).not.toContain('c.txt')
  })
  it('returns ok:false and leaves a conflict when revert cannot apply cleanly', async () => {
    const r2 = await mkdtemp(path.join(tmpdir(), 'gitdesk-revc-'))
    try {
      await git(r2, ['init', '-q'])
      await git(r2, ['config', 'user.email', 't@t.com'])
      await git(r2, ['config', 'user.name', 't'])
      await git(r2, ['config', 'commit.gpgsign', 'false'])
      await writeFile(path.join(r2, 'f.txt'), 'A\n'); await git(r2, ['add', '-A']); await git(r2, ['commit', '-q', '-m', 'c1'])
      await writeFile(path.join(r2, 'f.txt'), 'B\n'); await git(r2, ['commit', '-aq', '-m', 'c2'])
      const c2 = (await git(r2, ['rev-parse', 'HEAD'])).trim()
      await writeFile(path.join(r2, 'f.txt'), 'C\n'); await git(r2, ['commit', '-aq', '-m', 'c3'])
      const res = await revertCommits(r2, [c2])
      expect(res.ok).toBe(false)
      const conflicted = (await getStatus(r2)).filter((s) => s.status === 'conflicted')
      expect(conflicted.length).toBeGreaterThan(0)
    } finally {
      await rm(r2, { recursive: true, force: true })
    }
  })
})

describe('isPushed', () => {
  it('is false for local-only commits and true for pushed commits', async () => {
    const remote = await mkdtemp(path.join(tmpdir(), 'gitdesk-rem-'))
    try {
      await git(remote, ['init', '-q', '--bare'])
      await git(repo, ['remote', 'add', 'origin', remote])
      const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      await git(repo, ['push', '-q', '-u', 'origin', branch]) // init..C 푸시
      await commitFile('d.txt', 'D'); const D = await rev('HEAD')
      expect(await isPushed(repo, A)).toBe(true)
      expect(await isPushed(repo, C)).toBe(true)
      expect(await isPushed(repo, D)).toBe(false)
    } finally {
      await rm(remote, { recursive: true, force: true })
    }
  })
})
