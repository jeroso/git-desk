import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git, GitError } from '../electron/git/exec'

let repo: string

beforeAll(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 'test@test.com'])
  await git(repo, ['config', 'user.name', 'test'])
})

afterAll(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('git()', () => {
  it('returns stdout on success', async () => {
    const out = await git(repo, ['rev-parse', '--is-inside-work-tree'])
    expect(out.trim()).toBe('true')
  })

  it('throws GitError with stderr on failure', async () => {
    await expect(git(repo, ['checkout', 'no-such-branch'])).rejects.toBeInstanceOf(GitError)
  })
})
