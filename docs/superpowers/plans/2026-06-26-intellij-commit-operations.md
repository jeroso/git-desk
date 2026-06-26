# IntelliJ-style 커밋 작업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커밋 그래프 우클릭에 IntelliJ 수준의 git 작업(Reset/Undo/Edit message/Drop/Squash/Revert)을 단일·다중 선택 모두 추가한다.

**Architecture:** 백엔드는 `child_process.execFile('git')` 래퍼(`electron/git/*`)에 plumbing 작업과 비대화형 `rebase -i` 엔진을 추가하고 IPC/preload로 노출한다. 프런트는 `CommitContextMenu` + 다이얼로그 + 선택 판정 순수 헬퍼를 추가하고 기존 `runOp`/`ConflictPanel` 충돌 흐름을 재사용한다.

**Tech Stack:** Electron 33, React 18, Zustand, TypeScript, Vitest(real-git 통합 테스트, environment: node), Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-26-intellij-commit-operations-design.md`

---

## File Structure

**신규**
- `electron/git/rebaseEdit.ts` — 비대화형 rebase 엔진 (drop/reword/squash)
- `src/lib/commitSelection.ts` — 선택 판정 순수 헬퍼
- `src/components/CommitContextMenu.tsx` — 커밋 우클릭 메뉴
- `src/components/ResetModeDialog.tsx`, `MessageDialog.tsx`, `RewriteWarningDialog.tsx` — 다이얼로그
- `test/commit-ops.test.ts`, `test/rebase-edit.test.ts`, `test/commit-selection.test.ts`

**수정**
- `electron/git/exec.ts` — `git()`에 env 옵션
- `electron/git/ops.ts` — resetTo/undoCommit/revertCommits/isPushed/editMessage + continue/abort에 'revert'
- `electron/ipc/index.ts`, `electron/preload.ts` — 신규 핸들러 + 'revert'
- `src/App.tsx` — runOp 확장 + 콜백/다이얼로그 wiring
- `src/components/CommitGraph/index.tsx` — 컨텍스트 메뉴 통합
- `src/store/conflictStore.ts`, `src/components/ConflictPanel.tsx` — 'revert' op

> **테스트 정책:** 백엔드 git 함수와 순수 헬퍼는 TDD(real-git/유닛). React 컴포넌트는 이 코드베이스에 테스트 인프라가 없으므로(환경 node) `npm run typecheck` + 수동 스모크로 검증한다.

---

### Task 1: `git()` env 옵션 추가

**Files:**
- Modify: `electron/git/exec.ts:18-30`
- Test: `test/commit-ops.test.ts` (신규, 이 태스크에서 생성)

- [ ] **Step 1: 실패하는 테스트 작성** — `test/commit-ops.test.ts` 생성

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: FAIL — `git()`가 3번째 인자를 받지 않아 env가 무시됨 (출력에 EnvPerson 없음).

- [ ] **Step 3: 구현** — `electron/git/exec.ts`의 `git` 함수 교체

```ts
/** 모든 git 호출의 단일 통로. 0이 아닌 종료코드면 GitError를 throw한다. */
export async function git(
  cwd: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv },
): Promise<string> {
  try {
    const { stdout } = await pExecFile('git', args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: opts?.env ? { ...process.env, ...opts.env } : undefined,
    })
    return stdout
  } catch (err) {
    const e = err as { code?: number; stderr?: string; message: string }
    throw new GitError(args, e.code ?? -1, e.stderr ?? e.message)
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add electron/git/exec.ts test/commit-ops.test.ts
git commit -m "feat(git): add optional env to git() exec wrapper"
```

---

### Task 2: `resetTo` + `undoCommit`

**Files:**
- Modify: `electron/git/ops.ts`
- Test: `test/commit-ops.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — `test/commit-ops.test.ts` 상단 import에 추가

```ts
import { getStatus } from '../electron/git/status'
import { resetTo, undoCommit } from '../electron/git/ops'
```

그리고 파일 끝에 describe 블록 추가:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: FAIL — `resetTo`, `undoCommit` 미정의 import 에러.

- [ ] **Step 3: 구현** — `electron/git/ops.ts`의 `rollback` 위(또는 `cherryPick` 아래)에 추가

```ts
/** 현재 브랜치 HEAD를 주어진 커밋으로 이동 (IntelliJ "Reset Current Branch to Here"). */
export function resetTo(repo: string, hash: string, mode: 'soft' | 'mixed' | 'hard') {
  return git(repo, ['reset', `--${mode}`, hash])
}

/** tip 커밋(들)을 무르되 변경분은 staged로 보존 (IntelliJ "Undo Commit"). hash = 되돌릴 가장 오래된 커밋. */
export function undoCommit(repo: string, hash: string) {
  return git(repo, ['reset', '--soft', `${hash}^`])
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add electron/git/ops.ts test/commit-ops.test.ts
git commit -m "feat(git): add resetTo and undoCommit"
```

---

### Task 3: `revertCommits` + continue/abort에 'revert'

**Files:**
- Modify: `electron/git/ops.ts:38-44`
- Test: `test/commit-ops.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — import에 `revertCommits` 추가하고 describe 블록 추가

```ts
// import { resetTo, undoCommit } → revertCommits 추가
import { resetTo, undoCommit, revertCommits } from '../electron/git/ops'
```

```ts
describe('revertCommits', () => {
  it('reverts a single commit, removing its file', async () => {
    const res = await revertCommits(repo, [C])
    expect(res.ok).toBe(true)
    const exists = await git(repo, ['cat-file', '-e', 'HEAD:c.txt']).then(() => 'exists').catch(() => 'missing')
    expect(exists).toBe('missing')
  })
  it('reverts multiple commits (newest→oldest)', async () => {
    const res = await revertCommits(repo, [C, B])
    expect(res.ok).toBe(true)
    const tree = await git(repo, ['ls-tree', '-r', '--name-only', 'HEAD'])
    expect(tree).toContain('a.txt')
    expect(tree).not.toContain('b.txt')
    expect(tree).not.toContain('c.txt')
  })
  it('returns ok:false and leaves a conflict when revert cannot apply cleanly', async () => {
    const r2 = await mkdtemp(path.join(tmpdir(), 'gitdesk-revc-'))
    try {
      await git(r2, ['init', '-q'])
      await git(r2, ['config', 'user.email', 't@t.com'])
      await git(r2, ['config', 'user.name', 't'])
      await git(r2, ['config', 'commit.gpgsign', 'false'])
      await writeFile(path.join(r2, 'f.txt'), 'A\n'); await git(r2, ['add', '-A']); await git(r2, ['commit', '-q', '-m', 'c1'])
      await writeFile(path.join(r2, 'f.txt'), 'B\n'); await git(r2, ['commit', '-aq', '-m', 'c2'])
      const c2 = (await git(r2, ['rev-parse', 'HEAD'])).trim()
      await writeFile(path.join(r2, 'f.txt'), 'C\n'); await git(r2, ['commit', '-aq', '-m', 'c3'])
      const res = await revertCommits(r2, [c2])
      expect(res.ok).toBe(false)
      const conflicted = (await getStatus(r2)).filter((s) => s.status === 'conflicted')
      expect(conflicted.length).toBeGreaterThan(0)
    } finally {
      await rm(r2, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: FAIL — `revertCommits` 미정의.

- [ ] **Step 3: 구현** — `electron/git/ops.ts`

`cherryPick` 아래에 추가:
```ts
/** 하나 이상의 커밋을 되돌린다 (호출부가 newest→oldest 순서로 전달). 충돌 시 ok:false. */
export function revertCommits(repo: string, hashes: string[]) {
  return tryOp(repo, ['revert', '--no-edit', ...hashes])
}
```

그리고 `continueOp` / `abortOp`의 op 유니온에 `'revert'` 추가:
```ts
export function continueOp(repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') {
  const args = op === 'merge' ? ['commit', '--no-edit'] : [op, '--continue']
  return tryOp(repo, args)
}
export function abortOp(repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') {
  return tryOp(repo, [op, '--abort'])
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add electron/git/ops.ts test/commit-ops.test.ts
git commit -m "feat(git): add revertCommits and revert op continue/abort"
```

---

### Task 4: `isPushed`

**Files:**
- Modify: `electron/git/ops.ts`
- Test: `test/commit-ops.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — import에 `isPushed` 추가, describe 추가

```ts
import { resetTo, undoCommit, revertCommits, isPushed } from '../electron/git/ops'
```

```ts
describe('isPushed', () => {
  it('is false for local-only commits and true for pushed commits', async () => {
    const remote = await mkdtemp(path.join(tmpdir(), 'gitdesk-rem-'))
    try {
      await git(remote, ['init', '-q', '--bare'])
      await git(repo, ['remote', 'add', 'origin', remote])
      const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      await git(repo, ['push', '-q', '-u', 'origin', branch]) // init..C 푸시
      await commitFile('d.txt', 'D'); const D = await rev('HEAD')
      expect(await isPushed(repo, A)).toBe(true)
      expect(await isPushed(repo, C)).toBe(true)
      expect(await isPushed(repo, D)).toBe(false)
    } finally {
      await rm(remote, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: FAIL — `isPushed` 미정의.

- [ ] **Step 3: 구현** — `electron/git/ops.ts`에 추가

```ts
/** 해당 커밋이 원격 추적 브랜치에 포함돼 있는지(=이미 푸시됐는지). */
export async function isPushed(repo: string, hash: string): Promise<boolean> {
  const out = await git(repo, ['branch', '-r', '--contains', hash])
  return out.trim().length > 0
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add electron/git/ops.ts test/commit-ops.test.ts
git commit -m "feat(git): add isPushed check"
```

---

### Task 5: 비대화형 rebase 엔진 `rebaseEdit`

**Files:**
- Create: `electron/git/rebaseEdit.ts`
- Test: `test/rebase-edit.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/rebase-edit.test.ts` 생성

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/rebase-edit.test.ts`
Expected: FAIL — `electron/git/rebaseEdit` 모듈 없음.

- [ ] **Step 3: 구현** — `electron/git/rebaseEdit.ts` 생성 (drop/reword/squash 전체 구현)

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from './exec'

export type RebaseEditRequest =
  | { kind: 'drop'; hashes: string[] }
  | { kind: 'reword'; hash: string; message: string }
  | { kind: 'squash'; hashes: string[]; message: string }

/** 단일 따옴표 셸 컨텍스트용 escape: ' → '\'' 후 전체를 '...'로 감쌈 (개행 보존). */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

async function tryEnv(
  repo: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; output: string }> {
  try {
    return { ok: true, output: await git(repo, args, { env }) }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Drop / Reword / Squash를 비대화형 `rebase -i`로 수행한다.
 * - GIT_SEQUENCE_EDITOR로 todo를 주입(시작 시 1회).
 * - 메시지는 `exec git commit --amend -m '...'` 인라인 → --continue 시 외부 파일 의존 없음.
 * - 충돌 시 ok:false. 호출부(runOp)가 op='rebase'로 ConflictPanel을 띄워 continue/abort 처리.
 */
export async function rebaseEdit(
  repo: string,
  req: RebaseEditRequest,
): Promise<{ ok: boolean; output: string }> {
  const targets = req.kind === 'reword' ? [req.hash] : req.hashes
  if (targets.length === 0) return { ok: false, output: '선택된 커밋이 없습니다' }
  const targetSet = new Set(targets)

  // HEAD까지의 전체 이력(oldest→newest). 대상이 모두 여기 있어야 현재 브랜치 조상.
  const all = (await git(repo, ['rev-list', '--reverse', 'HEAD']))
    .split('\n').map((s) => s.trim()).filter(Boolean)
  const allSet = new Set(all)
  if (!targets.every((t) => allSet.has(t)))
    return { ok: false, output: '선택한 커밋이 현재 브랜치에 없습니다' }

  const oldest = all.find((h) => targetSet.has(h))! // 가장 오래된 대상
  const inRange = all.slice(all.indexOf(oldest)) // oldest→newest, == base..HEAD

  // base = oldest의 부모. 루트면 null.
  let base: string | null
  try {
    await git(repo, ['rev-parse', '--verify', `${oldest}^`])
    base = `${oldest}^`
  } catch {
    base = null
  }

  // rebase todo 라인 생성
  const lines: string[] = []
  if (req.kind === 'drop') {
    for (const sha of inRange) if (!targetSet.has(sha)) lines.push(`pick ${sha}`)
    if (lines.length === 0) {
      // 범위 내 모든 커밋 드롭 → HEAD를 base로 되돌림.
      if (!base) return { ok: false, output: '루트 커밋은 이 방식으로 드롭할 수 없습니다' }
      return tryEnv(repo, ['reset', '--hard', base], {})
    }
  } else if (req.kind === 'reword') {
    for (const sha of inRange) {
      lines.push(`pick ${sha}`)
      if (sha === req.hash) lines.push(`exec git commit --amend -m ${shq(req.message)}`)
    }
  } else {
    const inTargets = inRange.filter((s) => targetSet.has(s))
    const newestTarget = inTargets[inTargets.length - 1]
    let seenFirst = false
    for (const sha of inRange) {
      if (targetSet.has(sha)) {
        lines.push(`${seenFirst ? 'fixup' : 'pick'} ${sha}`)
        seenFirst = true
        if (sha === newestTarget) lines.push(`exec git commit --amend -m ${shq(req.message)}`)
      } else {
        lines.push(`pick ${sha}`)
      }
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), 'gitdesk-rebase-'))
  const todoPath = join(tmp, 'todo')
  writeFileSync(todoPath, lines.join('\n') + '\n')
  try {
    const baseArg = base ?? '--root'
    return await tryEnv(
      repo,
      ['-c', 'core.editor=true', 'rebase', '-i', '--autostash', baseArg],
      { GIT_SEQUENCE_EDITOR: `cp ${shq(todoPath)}` },
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- test/rebase-edit.test.ts`
Expected: PASS (drop 3건)

- [ ] **Step 5: 커밋**

```bash
git add electron/git/rebaseEdit.ts test/rebase-edit.test.ts
git commit -m "feat(git): non-interactive rebase engine (drop)"
```

---

### Task 6: rebaseEdit reword 커버리지

**Files:**
- Test: `test/rebase-edit.test.ts`

- [ ] **Step 1: 테스트 추가** — 파일 끝에 describe 추가

```ts
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
```

- [ ] **Step 2: 실행** (모듈은 이미 reword 지원 → 회귀/특성 테스트)

Run: `npm run test -- test/rebase-edit.test.ts`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add test/rebase-edit.test.ts
git commit -m "test(git): cover rebaseEdit reword"
```

---

### Task 7: rebaseEdit squash 커버리지

**Files:**
- Test: `test/rebase-edit.test.ts`

- [ ] **Step 1: 테스트 추가**

```ts
describe('rebaseEdit squash', () => {
  it('squashes contiguous commits into one with a combined message', async () => {
    const res = await rebaseEdit(repo, { kind: 'squash', hashes: [B, C], message: 'B+C squashed' })
    expect(res.ok).toBe(true)
    const s = await subjects()
    expect(s).toContain('B+C squashed')
    expect(s).not.toContain('B')
    expect(s).not.toContain('C')
    const t = await tree()
    expect(t).toContain('b.txt'); expect(t).toContain('c.txt')
    expect((await getLog(repo, 50)).length).toBe(3) // init, A, squashed
  })
})
```

- [ ] **Step 2: 실행**

Run: `npm run test -- test/rebase-edit.test.ts`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add test/rebase-edit.test.ts
git commit -m "test(git): cover rebaseEdit squash"
```

---

### Task 8: `editMessage` 라우터

**Files:**
- Modify: `electron/git/ops.ts`
- Test: `test/commit-ops.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — import에 `editMessage`, getLog 추가, describe 추가

```ts
import { getLog } from '../electron/git/log'
import { resetTo, undoCommit, revertCommits, isPushed, editMessage } from '../electron/git/ops'
```

```ts
describe('editMessage', () => {
  it('amends the HEAD commit message (fast path)', async () => {
    const res = await editMessage(repo, C, "fix: it's amended")
    expect(res.ok).toBe(true)
    expect((await getLog(repo, 10))[0].subject).toBe("fix: it's amended")
  })
  it('rewords a middle commit message via rebase', async () => {
    const res = await editMessage(repo, B, 'B reworded')
    expect(res.ok).toBe(true)
    const s = (await getLog(repo, 10)).map((c) => c.subject)
    expect(s).toContain('B reworded')
    expect(s).toContain('C')
    expect(s).not.toContain('B')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/commit-ops.test.ts`
Expected: FAIL — `editMessage` 미정의.

- [ ] **Step 3: 구현** — `electron/git/ops.ts`

상단 import에 추가:
```ts
import { rebaseEdit } from './rebaseEdit'
```

함수 추가:
```ts
/** 커밋 메시지 수정. HEAD면 amend(빠른 경로), 중간 커밋이면 rebase reword. */
export async function editMessage(repo: string, hash: string, message: string) {
  const head = (await git(repo, ['rev-parse', 'HEAD'])).trim()
  if (hash === head) return tryOp(repo, ['commit', '--amend', '-m', message])
  return rebaseEdit(repo, { kind: 'reword', hash, message })
}
```

- [ ] **Step 4: 통과 확인 + 전체 백엔드 테스트**

Run: `npm run test -- test/commit-ops.test.ts test/rebase-edit.test.ts`
Expected: PASS (전부)

- [ ] **Step 5: 커밋**

```bash
git add electron/git/ops.ts test/commit-ops.test.ts
git commit -m "feat(git): editMessage routing (amend HEAD / rebase reword)"
```

---

### Task 9: IPC + preload 노출

**Files:**
- Modify: `electron/ipc/index.ts:12`, 핸들러 블록
- Modify: `electron/preload.ts:10-56`

- [ ] **Step 1: ipc 핸들러 추가** — `electron/ipc/index.ts`

import 라인(12) 교체:
```ts
import {
  mergeBranch, rebaseOnto, cherryPick, continueOp, abortOp, markResolved, rollback, smartCheckout,
  resetTo, undoCommit, revertCommits, isPushed, editMessage,
} from '../git/ops'
import { rebaseEdit, type RebaseEditRequest } from '../git/rebaseEdit'
```

`git:cherryPick` 핸들러 아래에 추가:
```ts
  ipcMain.handle('git:reset', (_e, repo: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
    resetTo(repo, hash, mode),
  )
  ipcMain.handle('git:undoCommit', (_e, repo: string, hash: string) => undoCommit(repo, hash))
  ipcMain.handle('git:revert', (_e, repo: string, hashes: string[]) => revertCommits(repo, hashes))
  ipcMain.handle('git:editMessage', (_e, repo: string, hash: string, message: string) =>
    editMessage(repo, hash, message),
  )
  ipcMain.handle('git:rebaseEdit', (_e, repo: string, req: RebaseEditRequest) => rebaseEdit(repo, req))
  ipcMain.handle('git:isPushed', (_e, repo: string, hash: string) => isPushed(repo, hash))
```

그리고 기존 `git:continueOp`/`git:abortOp`의 op 타입에 `'revert'` 추가:
```ts
  ipcMain.handle('git:continueOp', (_e, repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
    continueOp(repo, op),
  )
  ipcMain.handle('git:abortOp', (_e, repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
    abortOp(repo, op),
  )
```

- [ ] **Step 2: preload 브릿지 추가** — `electron/preload.ts`

파일 상단에 type import:
```ts
import type { RebaseEditRequest } from './git/rebaseEdit'
```

`cherryPick` 라인 아래에 추가:
```ts
    reset: (repo: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
      ipcRenderer.invoke('git:reset', repo, hash, mode),
    undoCommit: (repo: string, hash: string) => ipcRenderer.invoke('git:undoCommit', repo, hash),
    revert: (repo: string, hashes: string[]) => ipcRenderer.invoke('git:revert', repo, hashes),
    editMessage: (repo: string, hash: string, message: string) =>
      ipcRenderer.invoke('git:editMessage', repo, hash, message),
    rebaseEdit: (repo: string, req: RebaseEditRequest) =>
      ipcRenderer.invoke('git:rebaseEdit', repo, req),
    isPushed: (repo: string, hash: string) => ipcRenderer.invoke('git:isPushed', repo, hash),
```

그리고 `continueOp`/`abortOp` 타입에 `'revert'` 추가:
```ts
    continueOp: (repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
      ipcRenderer.invoke('git:continueOp', repo, op),
    abortOp: (repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
      ipcRenderer.invoke('git:abortOp', repo, op),
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: PASS (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add electron/ipc/index.ts electron/preload.ts
git commit -m "feat(ipc): expose reset/undo/revert/editMessage/rebaseEdit/isPushed"
```

---

### Task 10: 선택 판정 헬퍼 `commitSelection`

**Files:**
- Create: `src/lib/commitSelection.ts`
- Test: `test/commit-selection.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/commit-selection.test.ts` 생성

```ts
import { describe, it, expect } from 'vitest'
import type { Commit } from '../src/types'
import {
  headHash, isOnCurrentBranch, isContiguousFromHead, isContiguousRange,
  orderedOldestToNewest, orderedNewestToOldest,
} from '../src/lib/commitSelection'

function mk(hash: string, parents: string[], refs: string[] = []): Commit {
  return { hash, parents, refs, author: '', dateISO: '', subject: '' }
}
// newest→oldest. main: c→b→a. side: x→a (feature).
const commits: Commit[] = [
  mk('c', ['b'], ['HEAD -> main']),
  mk('x', ['a'], ['feature']),
  mk('b', ['a']),
  mk('a', []),
]
const S = (...h: string[]) => new Set(h)

describe('headHash', () => {
  it('finds the HEAD commit', () => expect(headHash(commits)).toBe('c'))
  it('returns null when no HEAD ref', () => expect(headHash([mk('z', [])])).toBeNull())
})
describe('isOnCurrentBranch', () => {
  it('true for first-parent ancestors of HEAD', () => {
    expect(isOnCurrentBranch(commits, S('a'))).toBe(true)
    expect(isOnCurrentBranch(commits, S('b', 'c'))).toBe(true)
  })
  it('false for a commit off the current branch', () => {
    expect(isOnCurrentBranch(commits, S('x'))).toBe(false)
  })
})
describe('isContiguousFromHead', () => {
  it('true for a contiguous tip including HEAD', () => {
    expect(isContiguousFromHead(commits, S('c'))).toBe(true)
    expect(isContiguousFromHead(commits, S('c', 'b'))).toBe(true)
  })
  it('false when HEAD not selected or there is a gap', () => {
    expect(isContiguousFromHead(commits, S('b'))).toBe(false)
    expect(isContiguousFromHead(commits, S('c', 'a'))).toBe(false)
  })
})
describe('isContiguousRange', () => {
  it('true for a linear contiguous selection of 2+', () => {
    expect(isContiguousRange(commits, S('b', 'c'))).toBe(true)
    expect(isContiguousRange(commits, S('a', 'b', 'c'))).toBe(true)
  })
  it('false for gaps or single selection', () => {
    expect(isContiguousRange(commits, S('a', 'c'))).toBe(false)
    expect(isContiguousRange(commits, S('c'))).toBe(false)
  })
})
describe('ordering helpers', () => {
  it('orders oldest→newest and newest→oldest', () => {
    expect(orderedOldestToNewest(commits, S('b', 'c'))).toEqual(['b', 'c'])
    expect(orderedNewestToOldest(commits, S('b', 'c'))).toEqual(['c', 'b'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/commit-selection.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `src/lib/commitSelection.ts` 생성

```ts
import type { Commit } from '../types'

/** refs에 HEAD 토큰이 있는 커밋 hash. 없으면 null. */
export function headHash(commits: Commit[]): string | null {
  for (const c of commits) {
    if (c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> '))) return c.hash
  }
  return null
}

/** 선택이 모두 HEAD의 first-parent 조상 경로상에 있는지 (재작성 가능 전제). */
export function isOnCurrentBranch(commits: Commit[], selected: Set<string>): boolean {
  if (selected.size === 0) return false
  const head = headHash(commits)
  if (!head) return false
  const byHash = new Map(commits.map((c) => [c.hash, c]))
  const remaining = new Set(selected)
  let cur: string | undefined = head
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    guard.add(cur)
    remaining.delete(cur)
    if (remaining.size === 0) return true
    cur = byHash.get(cur)?.parents[0]
  }
  return remaining.size === 0
}

/** HEAD 포함 + first-parent로 정확히 선택 집합과 일치하는 연속 tip인지 (Undo 조건). */
export function isContiguousFromHead(commits: Commit[], selected: Set<string>): boolean {
  if (selected.size === 0) return false
  const head = headHash(commits)
  if (!head || !selected.has(head)) return false
  const byHash = new Map(commits.map((c) => [c.hash, c]))
  let cur: string | undefined = head
  let count = 0
  while (cur && count < selected.size) {
    if (!selected.has(cur)) return false
    count++
    cur = byHash.get(cur)?.parents[0]
  }
  return count === selected.size
}

/** 선택이 first-parent 선형 연속 구간인지 (Squash 조건, 2개+). 머지 커밋 포함 시 false. */
export function isContiguousRange(commits: Commit[], selected: Set<string>): boolean {
  if (selected.size < 2) return false
  const ordered = commits.filter((c) => selected.has(c.hash)) // newest→oldest
  if (ordered.length !== selected.size) return false
  for (let i = 0; i < ordered.length - 1; i++) {
    const newer = ordered[i]
    const older = ordered[i + 1]
    if (newer.parents.length !== 1) return false
    if (newer.parents[0] !== older.hash) return false
  }
  return true
}

/** commits는 newest→oldest. 선택을 oldest→newest로. */
export function orderedOldestToNewest(commits: Commit[], selected: Set<string>): string[] {
  return commits.filter((c) => selected.has(c.hash)).map((c) => c.hash).reverse()
}
/** 선택을 newest→oldest로. */
export function orderedNewestToOldest(commits: Commit[], selected: Set<string>): string[] {
  return commits.filter((c) => selected.has(c.hash)).map((c) => c.hash)
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- test/commit-selection.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/commitSelection.ts test/commit-selection.test.ts
git commit -m "feat(ui): commit selection predicate helpers"
```

---

### Task 11: conflictStore + ConflictPanel에 'revert'

**Files:**
- Modify: `src/store/conflictStore.ts:5`
- Modify: `src/components/ConflictPanel.tsx:21`

- [ ] **Step 1: conflictStore Op 타입 확장**

`src/store/conflictStore.ts`의 Op 타입 교체:
```ts
type Op = 'merge' | 'rebase' | 'cherry-pick' | 'checkout' | 'revert'
```

- [ ] **Step 2: ConflictPanel resumeOp 캐스트 확장**

`src/components/ConflictPanel.tsx:21` 교체:
```ts
  const resumeOp = op as 'merge' | 'rebase' | 'cherry-pick' | 'revert'
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add src/store/conflictStore.ts src/components/ConflictPanel.tsx
git commit -m "feat(ui): support revert in conflict flow"
```

---

### Task 12: `runOp` 확장 (revert op + label)

**Files:**
- Modify: `src/App.tsx:60-76`

- [ ] **Step 1: runOp 교체**

```ts
  async function runOp(
    repoPath: string,
    fn: () => Promise<{ ok: boolean; output: string }>,
    op: 'merge' | 'rebase' | 'cherry-pick' | 'checkout' | 'revert',
    label?: string,
  ) {
    const res = await withToast(fn)
    const status: FileChange[] = (await withToast(() => window.api.git.status(repoPath))) ?? []
    const conflicted = status.filter((c) => c.status === 'conflicted').map((c) => c.path)
    if (conflicted.length > 0) {
      conflict.open(op, conflicted)
    } else if (res && !res.ok) {
      useToast.getState().show(res.output)
    } else if (res && res.ok) {
      notify(op === 'checkout' ? '스마트 체크아웃 완료' : `${label ?? op} 완료`)
    }
    log.refresh(repoPath)
  }
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add src/App.tsx
git commit -m "feat(ui): runOp accepts revert op and optional label"
```

---

### Task 13: 다이얼로그 3종

**Files:**
- Create: `src/components/ResetModeDialog.tsx`
- Create: `src/components/MessageDialog.tsx`
- Create: `src/components/RewriteWarningDialog.tsx`

- [ ] **Step 1: `ResetModeDialog.tsx` 생성**

```tsx
import { useState } from 'react'

type Mode = 'soft' | 'mixed' | 'hard'

export function ResetModeDialog({
  shortHash,
  onCancel,
  onConfirm,
}: {
  shortHash: string
  onCancel: () => void
  onConfirm: (mode: Mode) => void
}) {
  const [mode, setMode] = useState<Mode>('mixed')
  const opts: { v: Mode; label: string; desc: string }[] = [
    { v: 'soft', label: 'Soft', desc: '커밋만 취소. 변경분은 staged 상태로 보존됩니다.' },
    { v: 'mixed', label: 'Mixed', desc: '커밋 취소 후 unstage. 변경분은 작업트리에 남습니다.' },
    { v: 'hard', label: 'Hard', desc: '커밋과 변경분을 모두 폐기합니다. 되돌릴 수 없습니다.' },
  ]
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-96 p-4 text-xs space-y-3">
        <div className="font-semibold text-sm">현재 브랜치를 {shortHash}(으)로 Reset</div>
        <div className="space-y-2">
          {opts.map((o) => (
            <label key={o.v} className="flex gap-2 items-start cursor-pointer">
              <input
                type="radio"
                name="reset-mode"
                checked={mode === o.v}
                onChange={() => setMode(o.v)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-gray-500 dark:text-neutral-400">{o.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="border dark:border-neutral-600 rounded px-3 py-1">
            취소
          </button>
          <button onClick={() => onConfirm(mode)} className="bg-blue-600 text-white rounded px-3 py-1">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `MessageDialog.tsx` 생성** (Edit message + Squash 공용)

```tsx
import { useState } from 'react'

export function MessageDialog({
  title,
  initial,
  onCancel,
  onConfirm,
}: {
  title: string
  initial: string
  onCancel: () => void
  onConfirm: (msg: string) => void
}) {
  const [msg, setMsg] = useState(initial)
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-[32rem] p-4 text-xs space-y-3">
        <div className="font-semibold text-sm">{title}</div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={6}
          autoFocus
          className="w-full border dark:border-neutral-600 dark:bg-neutral-900 rounded p-2 font-mono"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="border dark:border-neutral-600 rounded px-3 py-1">
            취소
          </button>
          <button
            onClick={() => onConfirm(msg)}
            disabled={msg.trim().length === 0}
            className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `RewriteWarningDialog.tsx` 생성**

```tsx
export function RewriteWarningDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-96 p-4 text-xs space-y-3">
        <div className="font-semibold text-sm text-amber-600">게시된 이력 재작성 경고</div>
        <p className="text-gray-600 dark:text-neutral-300">
          이 작업은 이미 원격에 푸시된 커밋을 재작성합니다. 다른 사람이 이 커밋을 받았다면 이후
          강제 푸시가 필요하고 충돌이 생길 수 있습니다. 계속할까요?
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="border dark:border-neutral-600 rounded px-3 py-1">
            취소
          </button>
          <button onClick={onConfirm} className="bg-amber-600 text-white rounded px-3 py-1">
            계속
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/ResetModeDialog.tsx src/components/MessageDialog.tsx src/components/RewriteWarningDialog.tsx
git commit -m "feat(ui): reset-mode, message, and rewrite-warning dialogs"
```

---

### Task 14: `CommitContextMenu`

**Files:**
- Create: `src/components/CommitContextMenu.tsx`

- [ ] **Step 1: 컴포넌트 생성** (BranchContextMenu 패턴 준수)

```tsx
import { useLayoutEffect, useRef, useState } from 'react'

export type CommitAction =
  | 'reset'
  | 'editMessage'
  | 'undo'
  | 'revert'
  | 'drop'
  | 'squash'
  | 'cherryPick'
  | 'copyHash'

interface Props {
  x: number
  y: number
  count: number
  shortHash: string
  canRewrite: boolean // 선택이 현재 브랜치 조상인지 (edit/drop/squash 전제)
  canUndo: boolean // HEAD 연속 tip
  canSquash: boolean // 선형 연속
  onClose: () => void
  onAction: (a: CommitAction) => void
}

type Item = { key: CommitAction; label: string; disabled?: boolean } | { divider: true }

export function CommitContextMenu({
  x,
  y,
  count,
  shortHash,
  canRewrite,
  canUndo,
  canSquash,
  onClose,
  onAction,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 4
    let nx = x
    let ny = y
    if (x + r.width > window.innerWidth) nx = Math.max(margin, window.innerWidth - r.width - margin)
    if (y + r.height > window.innerHeight) ny = Math.max(margin, y - r.height)
    setPos({ x: nx, y: ny })
  }, [x, y])

  const items: Item[] =
    count > 1
      ? [
          { key: 'cherryPick', label: `Cherry-Pick ${count} commits` },
          { key: 'revert', label: `Revert ${count} commits` },
          { divider: true },
          { key: 'drop', label: `Drop ${count} commits`, disabled: !canRewrite },
          { key: 'squash', label: `Squash ${count} commits`, disabled: !canRewrite || !canSquash },
        ]
      : [
          { key: 'reset', label: 'Reset Current Branch to Here…' },
          { key: 'editMessage', label: 'Edit Commit Message…', disabled: !canRewrite },
          { key: 'undo', label: 'Undo Commit', disabled: !canUndo },
          { divider: true },
          { key: 'revert', label: 'Revert Commit' },
          { key: 'drop', label: 'Drop Commit', disabled: !canRewrite },
          { key: 'cherryPick', label: 'Cherry-Pick' },
          { divider: true },
          { key: 'copyHash', label: `Copy Revision (${shortHash})` },
        ]

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={ref}
        className="fixed z-50 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg text-xs py-1 w-60"
        style={{ left: pos.x, top: pos.y }}
      >
        {items.map((it, i) =>
          'divider' in it ? (
            <div key={`d${i}`} className="my-1 border-t dark:border-neutral-700" />
          ) : (
            <button
              key={it.key}
              disabled={it.disabled}
              onClick={() => {
                onAction(it.key)
                onClose()
              }}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-neutral-700 dark:text-neutral-200 disabled:opacity-40"
            >
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS (아직 사용처 없음, 컴파일만)

- [ ] **Step 3: 커밋**

```bash
git add src/components/CommitContextMenu.tsx
git commit -m "feat(ui): CommitContextMenu component"
```

---

### Task 15: `CommitGraph` 통합

**Files:**
- Modify: `src/components/CommitGraph/index.tsx` (전체 교체)

- [ ] **Step 1: 파일 전체 교체**

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Commit, GraphLayout } from '../../types'
import { ROW_H, NODE_R, cx, cy, laneColor, graphWidth } from './render'
import { CommitContextMenu, type CommitAction } from '../CommitContextMenu'
import {
  isOnCurrentBranch,
  isContiguousFromHead,
  isContiguousRange,
  orderedOldestToNewest,
} from '../../lib/commitSelection'

interface Props {
  commits: Commit[]
  graph: GraphLayout
  selectedHash: string | null
  onSelect: (hash: string) => void
  onCherryPick: (hashes: string[]) => void
  onReset: (hash: string) => void
  onUndo: (oldestHash: string) => void
  onEditMessage: (hash: string) => void
  onRevert: (hashesNewestToOldest: string[]) => void
  onDrop: (hashes: string[]) => void
  onSquash: (hashes: string[]) => void
}

export function CommitGraph({
  commits,
  graph,
  selectedHash,
  onSelect,
  onCherryPick,
  onReset,
  onUndo,
  onEditMessage,
  onRevert,
  onDrop,
  onSquash,
}: Props) {
  const width = graphWidth(graph)
  const height = commits.length * ROW_H

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; acting: string[] } | null>(null)

  useEffect(() => {
    setSelected(new Set())
    setAnchor(null)
    setMenu(null)
  }, [commits])

  const indexOf = useMemo(() => {
    const m = new Map<string, number>()
    commits.forEach((c, i) => m.set(c.hash, i))
    return m
  }, [commits])

  const handleClick = (row: number, hash: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor !== null) {
      const [lo, hi] = anchor < row ? [anchor, row] : [row, anchor]
      setSelected(new Set(commits.slice(lo, hi + 1).map((c) => c.hash)))
    } else if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(hash)) next.delete(hash)
        else next.add(hash)
        return next
      })
      setAnchor(row)
    } else {
      setSelected(new Set([hash]))
      setAnchor(row)
    }
    onSelect(hash)
  }

  const handleContextMenu = (hash: string, e: React.MouseEvent) => {
    e.preventDefault()
    // 우클릭이 멀티선택 내부면 선택 전체를, 아니면 해당 커밋만 대상으로.
    const acting = selected.has(hash) && selected.size > 1 ? [...selected] : [hash]
    setMenu({ x: e.clientX, y: e.clientY, acting })
  }

  const actingSet = menu ? new Set(menu.acting) : new Set<string>()
  const orderedOld = menu ? orderedOldestToNewest(commits, actingSet) : []

  const handleAction = (a: CommitAction) => {
    if (!menu) return
    const single = orderedOld[0]
    if (!single) return
    if (a === 'cherryPick') onCherryPick(orderedOld)
    else if (a === 'revert') onRevert([...orderedOld].reverse())
    else if (a === 'drop') onDrop(orderedOld)
    else if (a === 'squash') onSquash(orderedOld)
    else if (a === 'reset') onReset(single)
    else if (a === 'editMessage') onEditMessage(single)
    else if (a === 'undo') onUndo(single)
    else if (a === 'copyHash') navigator.clipboard?.writeText(single)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="relative" style={{ height }}>
        <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none">
          {graph.edges.map((e, i) => (
            <path
              key={i}
              d={`M ${cx(e.fromLane)} ${cy(e.fromRow)} C ${cx(e.fromLane)} ${cy(e.fromRow) + ROW_H / 2}, ${cx(e.toLane)} ${cy(e.toRow) - ROW_H / 2}, ${cx(e.toLane)} ${cy(e.toRow)}`}
              stroke={laneColor(e.fromLane)}
              strokeWidth={1.5}
              fill="none"
            />
          ))}
          {graph.nodes.map((n) => (
            <circle key={n.hash} cx={cx(n.lane)} cy={cy(n.row)} r={NODE_R} fill={laneColor(n.lane)} />
          ))}
        </svg>
        <div style={{ marginLeft: width }}>
          {commits.map((c, row) => {
            const isActive = c.hash === selectedHash
            const inSelection = selected.has(c.hash)
            const bg = isActive
              ? 'bg-blue-100 dark:bg-blue-500/30'
              : inSelection
                ? 'bg-blue-50 dark:bg-blue-500/15'
                : 'hover:bg-gray-100 dark:hover:bg-neutral-800'
            return (
              <button
                key={c.hash}
                onClick={(e) => handleClick(row, c.hash, e)}
                onContextMenu={(e) => handleContextMenu(c.hash, e)}
                style={{ height: ROW_H }}
                className={`w-full flex items-center gap-3 px-2 text-left whitespace-nowrap select-none ${bg}`}
              >
                {c.refs.length > 0 && (
                  <span className="flex gap-1">
                    {c.refs.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] bg-amber-200 dark:bg-amber-700 dark:text-amber-100 rounded px-1"
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                )}
                <span className="flex-1 truncate" title={c.subject}>
                  {c.subject}
                </span>
                <span className="text-gray-500 dark:text-neutral-400 w-20 truncate">{c.author}</span>
                <span className="text-gray-400 dark:text-neutral-500 w-16 text-right">
                  {c.dateISO.slice(0, 10)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {menu && (
        <CommitContextMenu
          x={menu.x}
          y={menu.y}
          count={menu.acting.length}
          shortHash={(orderedOld[0] ?? '').slice(0, 7)}
          canRewrite={isOnCurrentBranch(commits, actingSet)}
          canUndo={isContiguousFromHead(commits, actingSet)}
          canSquash={isContiguousRange(commits, actingSet)}
          onClose={() => setMenu(null)}
          onAction={handleAction}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입체크** (App.tsx가 아직 새 props를 안 넘겨 에러 발생 예상 — 다음 태스크에서 해소)

Run: `npm run typecheck`
Expected: FAIL — `App.tsx`에서 CommitGraph에 onReset 등 누락. (예상된 실패; Task 16에서 해소)

- [ ] **Step 3: 커밋**

```bash
git add src/components/CommitGraph/index.tsx
git commit -m "feat(ui): wire CommitContextMenu into CommitGraph"
```

---

### Task 16: `App.tsx` wiring

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: import 추가** (기존 import 블록 끝, `import type { FileChange }` 위)

```tsx
import { ResetModeDialog } from './components/ResetModeDialog'
import { MessageDialog } from './components/MessageDialog'
import { RewriteWarningDialog } from './components/RewriteWarningDialog'
import { headHash } from './lib/commitSelection'
```

- [ ] **Step 2: 상태 추가** (`const conflict = useConflictStore()` 바로 아래)

```tsx
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ hash: string; initial: string } | null>(null)
  const [squashTarget, setSquashTarget] = useState<{ hashes: string[]; initial: string } | null>(null)
  const [rewriteWarn, setRewriteWarn] = useState<{ run: () => void } | null>(null)
```

- [ ] **Step 3: 헬퍼 추가** (`runOp` 함수 정의 바로 아래, `return (` 위)

```tsx
  async function guardPushed(relevantHash: string, run: () => void) {
    if (!repo) return
    const pushed = await window.api.git.isPushed(repo, relevantHash)
    if (pushed) setRewriteWarn({ run })
    else run()
  }
  async function doReset(hash: string, mode: 'soft' | 'mixed' | 'hard') {
    const out = await withToast(() => window.api.git.reset(repo!, hash, mode))
    if (out !== undefined) notify(`Reset (${mode}) 완료`)
    log.refresh(repo!)
  }
  async function doUndo(hash: string) {
    const out = await withToast(() => window.api.git.undoCommit(repo!, hash))
    if (out !== undefined) notify('Undo Commit 완료')
    log.refresh(repo!)
  }
```

- [ ] **Step 4: CommitGraph 사용처 교체** (`{log.graph && (` 블록의 `<CommitGraph ... />`)

```tsx
                      <CommitGraph
                        commits={log.commits}
                        graph={log.graph}
                        selectedHash={log.selectedHash}
                        onSelect={(h) => log.selectCommit(repo, h)}
                        onCherryPick={(hashes) =>
                          runOp(repo!, () => window.api.git.cherryPick(repo!, hashes), 'cherry-pick')
                        }
                        onRevert={(hashes) =>
                          runOp(repo!, () => window.api.git.revert(repo!, hashes), 'revert', '되돌리기')
                        }
                        onReset={(hash) => setResetTarget(hash)}
                        onUndo={(hash) =>
                          guardPushed(headHash(log.commits) ?? hash, () => doUndo(hash))
                        }
                        onEditMessage={(hash) => {
                          const c = log.commits.find((x) => x.hash === hash)
                          setEditTarget({ hash, initial: c?.subject ?? '' })
                        }}
                        onDrop={(hashes) =>
                          guardPushed(hashes[0], () =>
                            runOp(
                              repo!,
                              () => window.api.git.rebaseEdit(repo!, { kind: 'drop', hashes }),
                              'rebase',
                              '드롭',
                            ),
                          )
                        }
                        onSquash={(hashes) => {
                          const initial = log.commits
                            .filter((c) => hashes.includes(c.hash))
                            .map((c) => c.subject)
                            .reverse()
                            .join('\n\n')
                          setSquashTarget({ hashes, initial })
                        }}
                      />
```

- [ ] **Step 5: 다이얼로그 렌더 추가** (`<PromptDialog />` 바로 위)

```tsx
      {resetTarget && (
        <ResetModeDialog
          shortHash={resetTarget.slice(0, 7)}
          onCancel={() => setResetTarget(null)}
          onConfirm={(mode) => {
            const h = resetTarget
            setResetTarget(null)
            guardPushed(headHash(log.commits) ?? h, () => doReset(h, mode))
          }}
        />
      )}
      {editTarget && (
        <MessageDialog
          title="커밋 메시지 수정"
          initial={editTarget.initial}
          onCancel={() => setEditTarget(null)}
          onConfirm={(msg) => {
            const { hash } = editTarget
            setEditTarget(null)
            guardPushed(hash, () =>
              runOp(
                repo!,
                () => window.api.git.editMessage(repo!, hash, msg),
                'rebase',
                '커밋 메시지 수정',
              ),
            )
          }}
        />
      )}
      {squashTarget && (
        <MessageDialog
          title={`Squash ${squashTarget.hashes.length} commits`}
          initial={squashTarget.initial}
          onCancel={() => setSquashTarget(null)}
          onConfirm={(msg) => {
            const { hashes } = squashTarget
            setSquashTarget(null)
            guardPushed(hashes[0], () =>
              runOp(
                repo!,
                () => window.api.git.rebaseEdit(repo!, { kind: 'squash', hashes, message: msg }),
                'rebase',
                'Squash',
              ),
            )
          }}
        />
      )}
      {rewriteWarn && (
        <RewriteWarningDialog
          onCancel={() => setRewriteWarn(null)}
          onConfirm={() => {
            const r = rewriteWarn.run
            setRewriteWarn(null)
            r()
          }}
        />
      )}
```

- [ ] **Step 6: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/App.tsx
git commit -m "feat(ui): wire commit operations, dialogs, push guard in App"
```

---

### Task 17: 최종 검증

**Files:** (없음 — 검증/스모크)

- [ ] **Step 1: 전체 테스트**

Run: `npm run test`
Expected: PASS (기존 + commit-ops + rebase-edit + commit-selection 전부)

- [ ] **Step 2: 타입체크 + 빌드**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 3: 수동 스모크** (`npm run dev`로 앱 실행 후 확인)

  - [ ] 커밋 단일 우클릭 → 메뉴 항목 표시(Reset…/Edit Message…/Undo/Revert/Drop/Cherry-Pick/Copy)
  - [ ] cmd/shift 다중선택 우클릭 → Cherry-Pick N / Revert N / Drop N / Squash N (연속일 때만 Squash 활성)
  - [ ] Reset(soft/mixed/hard) 각각 동작, HEAD 이동 확인
  - [ ] Edit Message: HEAD와 중간 커밋 모두 메시지 변경
  - [ ] Drop: tip/중간/다중 동작
  - [ ] Squash: 연속 2개+ 결합 + 메시지 적용
  - [ ] Revert: 단일/다중, 충돌 시 ConflictPanel 표시 후 continue/abort
  - [ ] 푸시된 커밋 재작성 시 경고 다이얼로그 표시

- [ ] **Step 4: 최종 커밋 (필요 시)**

```bash
git add -A
git commit -m "chore: finalize IntelliJ-style commit operations" || true
```

---

## Self-Review 결과

- **Spec 커버리지:** Reset(Task 2/13/16), Undo(2/16), Edit message(8/16), Revert(3/16), Drop(5/16), Squash(7/13/16), 다중선택(14/15), 푸시 경고(4/13/16), rebase 엔진(5-7), 충돌 통합(11/12), 선택 판정(10). 모두 태스크 존재. ✅
- **Placeholder:** 없음.
- **타입 일관성:** `RebaseEditRequest`(rebaseEdit.ts) — ipc/preload/App에서 동일 구조 사용. op 유니온 `'revert'`는 ops/preload/ipc/conflictStore/ConflictPanel/App 전부 반영. `CommitAction`은 CommitContextMenu에서 export → CommitGraph에서 import. 헬퍼 이름(headHash/isOnCurrentBranch/isContiguousFromHead/isContiguousRange/orderedOldestToNewest/orderedNewestToOldest) 일관.
