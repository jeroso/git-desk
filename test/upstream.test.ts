import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { getLog } from '../electron/git/log'
import { pull, push, updateBranch } from '../electron/git/remote'

async function initRepo(dir: string) {
  await git(dir, ['init', '-q'])
  await git(dir, ['config', 'user.email', 'test@test.com'])
  await git(dir, ['config', 'user.name', 'test'])
  await git(dir, ['config', 'commit.gpgsign', 'false'])
}

const upstreamOf = async (repo: string, branch: string) =>
  (await git(repo, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim()

let remote: string
let a: string // 사용자 저장소
let b: string // 원격에 커밋을 밀어넣는 두 번째 클론

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
  // origin에 'staging'이 이미 존재하고 앞서 있는 상태
  await git(b, ['checkout', '-q', '-b', 'staging', 'main'])
  await git(b, ['commit', '-q', '--allow-empty', '-m', 'c2'])
  await git(b, ['push', '-q', '-u', 'origin', 'staging'])
})

afterEach(async () => {
  for (const d of [remote, a, b]) await rm(d, { recursive: true, force: true })
})

/**
 * 사용자가 한 것과 같이 로컬 브랜치를 main에서 만든다 → upstream 없음.
 * (reflog에 "branch: Created from main"으로 남는 그 경로)
 */
async function localBranchFromMain(name: string) {
  await git(a, ['checkout', '-q', '-b', name, 'main'])
  expect(await upstreamOf(a, name)).toBe('')
}

describe('pull on a branch with no upstream', () => {
  it('pulls from the same-named origin branch and records it as the upstream', async () => {
    await localBranchFromMain('staging')

    await pull(a)

    expect((await getLog(a, 500, 'staging')).map((c) => c.subject)).toContain('c2')
    // 한 번 연결해 두면 이후 pull/push가 그대로 동작한다.
    expect(await upstreamOf(a, 'staging')).toBe('origin/staging')
  })

  it('updateBranch on the current branch takes the same path', async () => {
    await localBranchFromMain('staging')

    await updateBranch(a, 'staging')

    expect((await getLog(a, 500, 'staging')).map((c) => c.subject)).toContain('c2')
    expect(await upstreamOf(a, 'staging')).toBe('origin/staging')
  })

  it('explains in Korean when the branch does not exist on origin', async () => {
    await localBranchFromMain('only-local')

    await expect(pull(a)).rejects.toThrow(/원격에 .*only-local.* 없습니다/)
  })

  it('leaves an existing upstream alone instead of re-pointing it at the same name', async () => {
    // 'mine'은 이름이 다른 원격 브랜치(origin/main)를 추적한다.
    await git(a, ['checkout', '-q', '-b', 'mine', '--track', 'origin/main'])
    expect(await upstreamOf(a, 'mine')).toBe('origin/main')

    await pull(a)

    expect(await upstreamOf(a, 'mine')).toBe('origin/main')
  })
})

describe('push on a branch with no upstream', () => {
  it('creates the branch on origin and sets it as the upstream', async () => {
    await localBranchFromMain('brand-new')
    await git(a, ['commit', '-q', '--allow-empty', '-m', 'work'])

    await push(a)

    // 원격에 실제로 브랜치가 생겼는지 원격 저장소에서 직접 확인한다.
    const onRemote = await git(remote, ['log', '-1', '--format=%s', 'refs/heads/brand-new'])
    expect(onRemote.trim()).toBe('work')
    expect(await upstreamOf(a, 'brand-new')).toBe('origin/brand-new')
  })

  it('pushes normally and keeps the upstream when one is already set', async () => {
    await git(a, ['commit', '-q', '--allow-empty', '-m', 'on-main'])

    await push(a)

    expect((await git(remote, ['log', '-1', '--format=%s', 'refs/heads/main'])).trim()).toBe('on-main')
    expect(await upstreamOf(a, 'main')).toBe('origin/main')
  })

  it('surfaces git\'s rejection when the branch exists on origin but is behind', async () => {
    // origin/staging이 앞서 있는데 로컬 staging은 뒤처진 상태에서 push.
    await localBranchFromMain('staging')
    await git(a, ['commit', '-q', '--allow-empty', '-m', 'local-only'])

    await expect(push(a)).rejects.toThrow(/rejected|non-fast-forward|fetch first/i)
  })
})
