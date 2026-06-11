import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getLog } from '../electron/git/log'
import { getBranches } from '../electron/git/branch'
import { getStatus } from '../electron/git/status'

// These hit real `git` through execFile. They guard against argv-level bugs that
// pure-string parser tests can't catch — e.g. passing raw NUL bytes in a --format
// argument, which Node's execFile rejects (ERR_INVALID_ARG_VALUE).

let repo: string

beforeAll(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-int-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 'test@test.com'])
  await git(repo, ['config', 'user.name', 'test'])
  await git(repo, ['commit', '-q', '--allow-empty', '-m', 'init'])
  await git(repo, ['branch', 'feature'])
  await git(repo, ['commit', '-q', '--allow-empty', '-m', 'second'])
})

afterAll(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('getLog (real git)', () => {
  it('returns parsed commits without throwing on the format argument', async () => {
    const commits = await getLog(repo)
    expect(commits.length).toBeGreaterThanOrEqual(2)
    const subjects = commits.map((c) => c.subject)
    expect(subjects).toContain('second')
    expect(subjects).toContain('init')
    // every commit has a 40-char hash and an ISO date
    expect(commits[0].hash).toMatch(/^[0-9a-f]{40}$/)
    expect(commits[0].dateISO).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('getBranches (real git)', () => {
  it('lists local branches without throwing on the format argument', async () => {
    const branches = await getBranches(repo)
    const names = branches.map((b) => b.name)
    expect(names).toContain('feature')
    // the checked-out branch (main or master depending on git defaults) is current
    const current = branches.find((b) => b.isCurrent)
    expect(current).toBeDefined()
  })
})

describe('getStatus (real git)', () => {
  it('reports an untracked file', async () => {
    await writeFile(path.join(repo, 'scratch.txt'), 'hello')
    const changes = await getStatus(repo)
    const scratch = changes.find((c) => c.path === 'scratch.txt')
    expect(scratch).toEqual({ path: 'scratch.txt', status: 'untracked', staged: false })
  })
})
