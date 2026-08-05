import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { mergeBranch } from '../electron/git/ops'
import { getStatus } from '../electron/git/status'
import { rebuildConflictText } from '../electron/git/conflictRebuild'
import { parseConflicts } from '../src/lib/mergeConflict'

let repo: string
let def: string

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-rebuild-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 't@t.com'])
  await git(repo, ['config', 'user.name', 't'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repo, 'seed'), 'seed\n')
  await git(repo, ['add', '-A'])
  await git(repo, ['commit', '-q', '-m', 'seed'])
  def = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
})
afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

/** def와 'feat'가 같은 파일을 다르게 고쳐 충돌하게 만든 뒤 merge를 시도한다. */
async function bothModifiedConflict() {
  await writeFile(path.join(repo, 'f.txt'), 'a\nbase\nc\n')
  await git(repo, ['add', '-A'])
  await git(repo, ['commit', '-q', '-m', 'base'])
  await git(repo, ['checkout', '-q', '-b', 'feat'])
  await writeFile(path.join(repo, 'f.txt'), 'a\nfeat\nc\n')
  await git(repo, ['commit', '-aq', '-m', 'feat'])
  await git(repo, ['checkout', '-q', def])
  await writeFile(path.join(repo, 'f.txt'), 'a\nmain\nc\n')
  await git(repo, ['commit', '-aq', '-m', 'main'])
  expect((await mergeBranch(repo, 'feat')).ok).toBe(false)
}

describe('rebuildConflictText', () => {
  it('rebuilds the conflict from index stages after the markers were wiped, without touching the worktree', async () => {
    await bothModifiedConflict()
    // "저장했지만 git add가 빠진" 상태를 재현한다: 마커 없는 내용 + 미해결 인덱스.
    const wiped = 'a\nHAND-RESOLVED\nc\n'
    await writeFile(path.join(repo, 'f.txt'), wiped)
    expect(parseConflicts(wiped).ok).toBe(false)

    const rebuilt = await rebuildConflictText(repo, 'f.txt')
    expect(rebuilt).not.toBeNull()
    const parsed = parseConflicts(rebuilt!)
    expect(parsed.ok).toBe(true)
    expect(parsed.conflictCount).toBe(1)
    // 양쪽 원본이 3-pane에 실제로 실려야 한다.
    const conflictSeg = parsed.segments.find((s) => s.type === 'conflict')!
    expect(conflictSeg).toMatchObject({ ours: ['main'], theirs: ['feat'] })
    // 워크트리 파일은 절대 건드리지 않는다.
    expect(await readFile(path.join(repo, 'f.txt'), 'utf8')).toBe(wiped)
  })

  it('rebuilds an add/add conflict, where the index has no base stage', async () => {
    await git(repo, ['checkout', '-q', '-b', 'aa'])
    await writeFile(path.join(repo, 'n.txt'), 'from-aa\n')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '-m', 'aa'])
    await git(repo, ['checkout', '-q', def])
    await writeFile(path.join(repo, 'n.txt'), 'from-main\n')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '-m', 'main-add'])
    await mergeBranch(repo, 'aa')
    await writeFile(path.join(repo, 'n.txt'), 'wiped\n')

    const parsed = parseConflicts((await rebuildConflictText(repo, 'n.txt'))!)
    expect(parsed.ok).toBe(true)
    expect(parsed.conflictCount).toBe(1)
  })

  it('returns null for a delete/modify conflict (index is missing a side)', async () => {
    await writeFile(path.join(repo, 'f.txt'), 'x\n')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '-m', 'base'])
    await git(repo, ['checkout', '-q', '-b', 'del'])
    await git(repo, ['rm', '-q', 'f.txt'])
    await git(repo, ['commit', '-q', '-m', 'delete'])
    await git(repo, ['checkout', '-q', def])
    await writeFile(path.join(repo, 'f.txt'), 'y\n')
    await git(repo, ['commit', '-aq', '-m', 'modify'])
    await mergeBranch(repo, 'del')
    expect((await getStatus(repo)).some((s) => s.status === 'conflicted')).toBe(true)

    expect(await rebuildConflictText(repo, 'f.txt')).toBeNull()
  })

  it('returns null for a binary conflict', async () => {
    await writeFile(path.join(repo, 'b.bin'), randomBytes(512))
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '-m', 'base'])
    await git(repo, ['checkout', '-q', '-b', 'bb'])
    await writeFile(path.join(repo, 'b.bin'), randomBytes(512))
    await git(repo, ['commit', '-aq', '-m', 'bb'])
    await git(repo, ['checkout', '-q', def])
    await writeFile(path.join(repo, 'b.bin'), randomBytes(512))
    await git(repo, ['commit', '-aq', '-m', 'main'])
    await mergeBranch(repo, 'bb')

    expect(await rebuildConflictText(repo, 'b.bin')).toBeNull()
  })

  it('returns null when the file is not unmerged at all', async () => {
    expect(await rebuildConflictText(repo, 'seed')).toBeNull()
  })
})
