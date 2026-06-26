import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getStatus } from '../electron/git/status'
import { resetTo, undoCommit } from '../electron/git/ops'

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
