import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { mergeBranch, rebaseOnto, continueOp, markResolved } from '../electron/git/ops'
import { getConflictState } from '../electron/git/conflictState'

let repo: string
let def: string
let savedEditor: string | undefined

beforeEach(async () => {
  // 셸에서 물려받은 에디터가 있는 상태를 재현한다. 'false'는 즉시 실패하는 명령으로,
  // "실제 대화형 에디터라면 영원히 멈추는 자리"를 테스트가 멈추지 않게 대신한다.
  // (앱은 환경의 에디터를 절대 쓰지 않아야 하므로 'false'가 실행되면 안 된다.)
  savedEditor = process.env.GIT_EDITOR
  process.env.GIT_EDITOR = 'false'

  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-cc-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 't@t.com'])
  await git(repo, ['config', 'user.name', 't'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repo, 'f.txt'), 'base\n')
  await git(repo, ['add', '-A']); await git(repo, ['commit', '-q', '-m', 'base'])
  def = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  await git(repo, ['checkout', '-q', '-b', 'feat'])
  await writeFile(path.join(repo, 'f.txt'), 'feat\n'); await git(repo, ['commit', '-aq', '-m', 'feat'])
  await git(repo, ['checkout', '-q', def])
  await writeFile(path.join(repo, 'f.txt'), 'main\n'); await git(repo, ['commit', '-aq', '-m', 'main'])
})
afterEach(async () => {
  if (savedEditor === undefined) delete process.env.GIT_EDITOR
  else process.env.GIT_EDITOR = savedEditor
  await rm(repo, { recursive: true, force: true })
})

/** 충돌 파일을 해결하고 "해결됨 표시"(git add)까지 한 상태를 만든다. */
async function resolve() {
  await writeFile(path.join(repo, 'f.txt'), 'resolved\n')
  await markResolved(repo, ['f.txt'])
}
const subject = async () => (await git(repo, ['log', '-1', '--format=%s'])).trim()

describe('continueOp', () => {
  it('finishes a conflicted merge', async () => {
    await mergeBranch(repo, 'feat')
    await resolve()
    const res = await continueOp(repo, 'merge')
    expect(res.ok).toBe(true)
    expect((await getConflictState(repo)).inProgress).toBe(false)
  })

  it('finishes a conflicted rebase without waiting on an editor', async () => {
    await rebaseOnto(repo, 'feat')
    await resolve()
    const res = await continueOp(repo, 'rebase')
    expect(res.ok).toBe(true)
    // 원본 커밋 메시지가 그대로 유지되어야 한다.
    expect(await subject()).toBe('main')
    expect((await getConflictState(repo)).inProgress).toBe(false)
  })
})
