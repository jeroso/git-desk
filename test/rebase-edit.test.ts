import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getLog } from '../electron/git/log'
import { rebaseEdit } from '../electron/git/rebaseEdit'

let repo: string
let A: string, B: string, C: string

async function commitFile(name: string, msg: string) {
  await writeFile(path.join(repo, name), `${name} content\n`)
  await git(repo, ['add', '--', name])
  await git(repo, ['commit', '-q', '-m', msg])
}
const rev = async (ref: string) => (await git(repo, ['rev-parse', ref])).trim()
const subjects = async () => (await getLog(repo, 50)).map((c) => c.subject)
const tree = async () => git(repo, ['ls-tree', '-r', '--name-only', 'HEAD'])

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-reb-'))
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

describe('rebaseEdit drop', () => {
  it('drops a middle commit', async () => {
    const res = await rebaseEdit(repo, { kind: 'drop', hashes: [B] })
    expect(res.ok).toBe(true)
    const t = await tree()
    expect(t).toContain('a.txt'); expect(t).toContain('c.txt'); expect(t).not.toContain('b.txt')
    expect(await subjects()).not.toContain('B')
  })
  it('drops the tip commit (reset path)', async () => {
    const res = await rebaseEdit(repo, { kind: 'drop', hashes: [C] })
    expect(res.ok).toBe(true)
    expect(await rev('HEAD')).toBe(B)
    expect(await tree()).not.toContain('c.txt')
  })
  it('drops multiple non-contiguous commits', async () => {
    const res = await rebaseEdit(repo, { kind: 'drop', hashes: [A, C] })
    expect(res.ok).toBe(true)
    const t = await tree()
    expect(t).not.toContain('a.txt'); expect(t).toContain('b.txt'); expect(t).not.toContain('c.txt')
  })
})

describe('rebaseEdit reword', () => {
  it('rewords a middle commit, preserving descendants and files', async () => {
    const res = await rebaseEdit(repo, { kind: 'reword', hash: B, message: "B's new msg" })
    expect(res.ok).toBe(true)
    const s = await subjects()
    expect(s).toContain("B's new msg")
    expect(s).toContain('C')
    expect(s).not.toContain('B')
    const t = await tree()
    expect(t).toContain('b.txt'); expect(t).toContain('c.txt')
  })
})
