import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getStatus } from '../electron/git/status'
import { mergeBranch, rebaseOnto } from '../electron/git/ops'

// develop 에 새 커밋이 생긴 뒤, 커밋하지 않은 수정이 있는 작업 브랜치에서 rebase/merge 한다.
// IntelliJ 처럼 로컬 변경을 잠시 보관했다가(--autostash) 끝나면 다시 적용해야 한다.
let repo: string

const write = (name: string, body: string) => writeFile(path.join(repo, name), body)
const read = (name: string) => readFile(path.join(repo, name), 'utf8')
async function commit(name: string, body: string, msg: string) {
  await write(name, body)
  await git(repo, ['add', '--', name])
  await git(repo, ['commit', '-q', '-m', msg])
}

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-autostash-'))
  await git(repo, ['init', '-q', '-b', 'develop'])
  await git(repo, ['config', 'user.email', 'test@test.com'])
  await git(repo, ['config', 'user.name', 'test'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await commit('a.txt', 'a\n', 'base a')
  await commit('b.txt', 'b\n', 'base b')
  await git(repo, ['checkout', '-q', '-b', 'feat'])
  await commit('f.txt', 'f\n', 'feat work')
  await git(repo, ['checkout', '-q', 'develop'])
  await commit('b.txt', 'b from develop\n', 'develop moves on')
  await git(repo, ['checkout', '-q', 'feat'])
})
afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('rebase/merge with uncommitted changes (autostash)', () => {
  it('rebase: 겹치지 않는 로컬 수정이 있어도 develop 위로 옮기고 수정은 그대로 둔다', async () => {
    await write('a.txt', 'a local edit\n')
    const res = await rebaseOnto(repo, 'develop')
    expect(res.ok).toBe(true)
    expect(await read('b.txt')).toBe('b from develop\n')
    expect(await read('f.txt')).toBe('f\n')
    expect(await read('a.txt')).toBe('a local edit\n')
    expect((await git(repo, ['stash', 'list'])).trim()).toBe('')
  })

  it('merge: 겹치지 않는 로컬 수정이 있어도 합치고 수정은 그대로 둔다', async () => {
    await write('a.txt', 'a local edit\n')
    const res = await mergeBranch(repo, 'develop')
    expect(res.ok).toBe(true)
    expect(await read('b.txt')).toBe('b from develop\n')
    expect(await read('a.txt')).toBe('a local edit\n')
  })

  it('rebase: develop 이 바꾼 파일을 로컬에서도 고쳤으면 rebase 는 끝나고, 되돌리기 충돌만 남는다(변경은 stash 에 보관)', async () => {
    await write('b.txt', 'b local edit\n')
    const res = await rebaseOnto(repo, 'develop')
    expect(res.ok).toBe(true)
    expect((await git(repo, ['log', '-1', '--format=%s', 'HEAD~1'])).trim()).toBe('develop moves on')
    const conflicted = (await getStatus(repo)).filter((c) => c.status === 'conflicted').map((c) => c.path)
    expect(conflicted).toEqual(['b.txt'])
    expect(await git(repo, ['stash', 'list'])).toContain('autostash')
  })
})
