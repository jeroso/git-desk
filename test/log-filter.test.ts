import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getLog, getAuthors } from '../electron/git/log'

async function initRepo(dir: string) {
  await git(dir, ['init', '-q'])
  await git(dir, ['config', 'commit.gpgsign', 'false'])
}

// 지정 작성자/날짜로 빈 커밋을 만든다(작성·커밋 날짜를 모두 고정해 --since/--until을 결정적으로).
async function commitAs(dir: string, name: string, subject: string, dateISO: string) {
  await git(dir, ['commit', '-q', '--allow-empty', '-m', subject], {
    env: {
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: `${name.toLowerCase()}@x.com`,
      GIT_AUTHOR_DATE: dateISO,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: `${name.toLowerCase()}@x.com`,
      GIT_COMMITTER_DATE: dateISO,
    },
  })
}

describe('getLog filter + getAuthors (real git)', () => {
  let repo: string

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'gd-logf-'))
    await initRepo(repo)
    await git(repo, ['checkout', '-q', '-b', 'main'])
    await commitAs(repo, 'Alice', 'feat: add login', '2026-01-01T10:00:00')
    await commitAs(repo, 'Bob', 'fix: login bug', '2026-02-01T10:00:00')
    await commitAs(repo, 'Alice', 'docs: update readme', '2026-03-01T10:00:00')
  })

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  it('filters by author (case-insensitive)', async () => {
    const subs = (await getLog(repo, 500, undefined, { author: 'alice' })).map((c) => c.subject)
    expect(subs.sort()).toEqual(['docs: update readme', 'feat: add login'])
  })

  it('filters by message text (grep, case-insensitive)', async () => {
    const subs = (await getLog(repo, 500, undefined, { text: 'LOGIN' })).map((c) => c.subject)
    expect(subs.sort()).toEqual(['feat: add login', 'fix: login bug'])
  })

  it('ANDs author and text together', async () => {
    const subs = (
      await getLog(repo, 500, undefined, { author: 'alice', text: 'login' })
    ).map((c) => c.subject)
    expect(subs).toEqual(['feat: add login'])
  })

  it('filters by date range, treating a bare until date as end-of-day', async () => {
    const subs = (
      await getLog(repo, 500, undefined, { since: '2026-02-01', until: '2026-02-01' })
    ).map((c) => c.subject)
    expect(subs).toEqual(['fix: login bug'])
  })

  it('getAuthors returns unique authors sorted', async () => {
    expect(await getAuthors(repo)).toEqual(['Alice', 'Bob'])
  })
})
