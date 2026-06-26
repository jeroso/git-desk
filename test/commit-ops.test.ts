import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'

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
