# 3-pane 충돌 머지 도구 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 충돌 파일을 IntelliJ식 3-pane(Ours · Result · Theirs)에서 클릭으로 해결하고 저장(파일 쓰기 + `git add`)하는 MVP를 추가한다.

**Architecture:** 작업트리 충돌 마커를 순수 함수로 파싱(공통/충돌 세그먼트) → 한 컨테이너의 3열 CSS 그리드로 세그먼트별 정렬 렌더(스크롤 자동 동기) → hunk별 채택 버튼 + 가운데 직접 편집 → 결과 텍스트를 파일에 쓰고 `markResolved`로 해결 표시 → 기존 `ConflictPanel`/continue·abort 흐름에 연결.

**Tech Stack:** Electron, React 18, Zustand, TypeScript, Vitest(real-git 통합 + 순수 유닛, environment node), Tailwind. 코드 에디터 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-06-26-merge-conflict-tool-design.md`

---

## File Structure

**신규**
- `src/lib/mergeConflict.ts` — 마커 파서 + 결과 빌더 (순수)
- `src/components/MergeView.tsx` — 3-pane 머지 모달
- `electron/git/worktreeFile.ts` — 작업트리 파일 read/write
- `test/merge-conflict.test.ts`, `test/worktree-file.test.ts`

**수정**
- `src/store/conflictStore.ts` — `mergeFile` + `openMerge`/`closeMerge`
- `src/components/ConflictPanel.tsx` — 파일 행에 "머지" 버튼
- `src/App.tsx` — `MergeView` 렌더 연결
- `electron/ipc/index.ts`, `electron/preload.ts` — read/writeWorktreeFile 노출

> **검증 게이트:** 이 repo의 `npm run typecheck`는 기존 깨짐(불관련, `@types/node` 미선언 + tsconfig.node composite/TS6307)이라 **사용 금지**. 타입 게이트는 **`npx tsc --noEmit`**(main tsconfig, src+electron 커버, 현재 EXIT 0). 테스트는 `npm run test`. React 컴포넌트는 자동 테스트 없음 → typecheck + 수동 스모크.

---

### Task 1: 충돌 마커 파서 `mergeConflict.ts`

**Files:**
- Create: `src/lib/mergeConflict.ts`
- Test: `test/merge-conflict.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/merge-conflict.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseConflicts, buildMerged } from '../src/lib/mergeConflict'

const basic =
  'line1\n<<<<<<< HEAD\nour line\n=======\ntheir line\n>>>>>>> feature\nline2\n'

const diff3 =
  'a\n<<<<<<< HEAD\nours\n||||||| base\nbase line\n=======\ntheirs\n>>>>>>> branch\nb\n'

const multi =
  '<<<<<<< HEAD\no1\n=======\nt1\n>>>>>>> x\nmid\n<<<<<<< HEAD\no2\n=======\nt2\n>>>>>>> x\n'

describe('parseConflicts', () => {
  it('parses a basic conflict into shared + conflict segments with labels', () => {
    const p = parseConflicts(basic)
    expect(p.ok).toBe(true)
    expect(p.conflictCount).toBe(1)
    expect(p.oursLabel).toBe('HEAD')
    expect(p.theirsLabel).toBe('feature')
    expect(p.segments[0]).toEqual({ type: 'shared', lines: ['line1'] })
    expect(p.segments[1]).toEqual({ type: 'conflict', ours: ['our line'], theirs: ['their line'] })
    expect(p.segments[2]).toEqual({ type: 'shared', lines: ['line2', ''] })
  })
  it('captures the base section in diff3 style', () => {
    const p = parseConflicts(diff3)
    expect(p.ok).toBe(true)
    const c = p.segments.find((s) => s.type === 'conflict')
    expect(c).toEqual({ type: 'conflict', ours: ['ours'], theirs: ['theirs'], base: ['base line'] })
  })
  it('counts multiple conflict hunks', () => {
    const p = parseConflicts(multi)
    expect(p.ok).toBe(true)
    expect(p.conflictCount).toBe(2)
  })
  it('returns ok:false when there are no markers', () => {
    expect(parseConflicts('just\nplain\ntext\n').ok).toBe(false)
  })
  it('returns ok:false for an unbalanced (unclosed) conflict', () => {
    expect(parseConflicts('<<<<<<< HEAD\nours\n=======\ntheirs\n').ok).toBe(false)
  })
})

describe('buildMerged', () => {
  it('rebuilds the file from per-conflict resolutions (preserving newlines)', () => {
    const p = parseConflicts(basic)
    expect(buildMerged(p.segments, ['our line'])).toBe('line1\nour line\nline2\n')
    expect(buildMerged(p.segments, ['our line\ntheir line'])).toBe('line1\nour line\ntheir line\nline2\n')
  })
  it('treats an empty resolution as deleting the hunk', () => {
    const p = parseConflicts(basic)
    expect(buildMerged(p.segments, [''])).toBe('line1\nline2\n')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/merge-conflict.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `src/lib/mergeConflict.ts`

```ts
export type ConflictSeg =
  | { type: 'shared'; lines: string[] }
  | { type: 'conflict'; ours: string[]; theirs: string[]; base?: string[] }

export interface ParsedConflict {
  segments: ConflictSeg[]
  conflictCount: number
  oursLabel: string
  theirsLabel: string
  ok: boolean
}

/**
 * 작업트리 충돌 파일(마커 포함)을 공통/충돌 세그먼트로 분해한다.
 * 기본 마커와 diff3(`|||||||`) 둘 다 지원. 마커가 없거나 닫히지 않으면 ok:false.
 */
export function parseConflicts(text: string): ParsedConflict {
  const lines = text.split('\n')
  const segments: ConflictSeg[] = []
  let shared: string[] = []
  let oursLabel = 'Ours'
  let theirsLabel = 'Theirs'
  let conflictCount = 0
  let ok = true
  let i = 0

  const flush = () => {
    if (shared.length) {
      segments.push({ type: 'shared', lines: shared })
      shared = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('<<<<<<<')) {
      flush()
      const label = line.slice(7).trim()
      if (label) oursLabel = label
      const ours: string[] = []
      const base: string[] = []
      const theirs: string[] = []
      let phase: 'ours' | 'base' | 'theirs' = 'ours'
      let closed = false
      i++
      while (i < lines.length) {
        const l = lines[i]
        if (l.startsWith('|||||||')) {
          phase = 'base'
        } else if (l.startsWith('=======')) {
          phase = 'theirs'
        } else if (l.startsWith('>>>>>>>')) {
          const t = l.slice(7).trim()
          if (t) theirsLabel = t
          closed = true
          i++
          break
        } else if (phase === 'ours') {
          ours.push(l)
        } else if (phase === 'base') {
          base.push(l)
        } else {
          theirs.push(l)
        }
        i++
      }
      if (!closed) {
        ok = false
        break
      }
      conflictCount++
      const seg: ConflictSeg = { type: 'conflict', ours, theirs }
      if (base.length) seg.base = base
      segments.push(seg)
    } else {
      shared.push(line)
      i++
    }
  }
  flush()
  if (conflictCount === 0) ok = false
  return { segments, conflictCount, oursLabel, theirsLabel, ok }
}

/**
 * 세그먼트 + 충돌별 해결 문자열로 최종 파일 텍스트를 재구성한다.
 * resolutions[i]는 i번째 conflict 세그먼트의 결과(여러 줄 가능). 빈 문자열/null은 해당 hunk 삭제.
 */
export function buildMerged(segments: ConflictSeg[], resolutions: (string | null)[]): string {
  const out: string[] = []
  let ci = 0
  for (const seg of segments) {
    if (seg.type === 'shared') {
      out.push(...seg.lines)
    } else {
      const r = resolutions[ci++] ?? ''
      if (r !== '') out.push(...r.split('\n'))
    }
  }
  return out.join('\n')
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- test/merge-conflict.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 5: 타입 게이트**

Run: `npx tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 6: 커밋**

```bash
git add src/lib/mergeConflict.ts test/merge-conflict.test.ts
git commit -m "feat(merge): conflict-marker parser and merged-text builder"
```

---

### Task 2: 백엔드 파일 read/write + IPC/preload

**Files:**
- Create: `electron/git/worktreeFile.ts`
- Test: `test/worktree-file.test.ts`
- Modify: `electron/ipc/index.ts`, `electron/preload.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/worktree-file.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from '../electron/git/exec'
import { mergeBranch, markResolved } from '../electron/git/ops'
import { getStatus } from '../electron/git/status'
import { readWorktreeFile, writeWorktreeFile } from '../electron/git/worktreeFile'

let repo: string
let def: string

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-wt-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 't@t.com'])
  await git(repo, ['config', 'user.name', 't'])
  await git(repo, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repo, 'f.txt'), 'base\n')
  await git(repo, ['add', '-A'])
  await git(repo, ['commit', '-q', '-m', 'base'])
  def = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  await git(repo, ['checkout', '-q', '-b', 'feat'])
  await writeFile(path.join(repo, 'f.txt'), 'feat-change\n')
  await git(repo, ['commit', '-aq', '-m', 'feat'])
  await git(repo, ['checkout', '-q', def])
  await writeFile(path.join(repo, 'f.txt'), 'main-change\n')
  await git(repo, ['commit', '-aq', '-m', 'main'])
})
afterEach(async () => { await rm(repo, { recursive: true, force: true }) })

describe('worktree file read/write around a conflict', () => {
  it('reads the conflicted file with markers, then writes a resolution that clears the conflict', async () => {
    const res = await mergeBranch(repo, 'feat')
    expect(res.ok).toBe(false) // conflict
    const raw = await readWorktreeFile(repo, 'f.txt')
    expect(raw).toContain('<<<<<<<')
    expect(raw).toContain('=======')
    expect(raw).toContain('>>>>>>>')

    await writeWorktreeFile(repo, 'f.txt', 'resolved\n')
    await markResolved(repo, ['f.txt'])
    const conflicted = (await getStatus(repo)).filter((s) => s.status === 'conflicted')
    expect(conflicted.length).toBe(0)
    expect(await readWorktreeFile(repo, 'f.txt')).toBe('resolved\n')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- test/worktree-file.test.ts`
Expected: FAIL — `electron/git/worktreeFile` 모듈 없음.

- [ ] **Step 3: 구현** — `electron/git/worktreeFile.ts`

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 작업트리 파일 원문(충돌 마커 포함)을 읽는다. file은 repo-상대 경로. */
export function readWorktreeFile(repo: string, file: string): Promise<string> {
  return readFile(join(repo, file), 'utf8')
}

/** 해결된 내용을 작업트리 파일에 쓴다. 이후 markResolved(git add)로 해결 표시. */
export async function writeWorktreeFile(repo: string, file: string, content: string): Promise<void> {
  await writeFile(join(repo, file), content, 'utf8')
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- test/worktree-file.test.ts`
Expected: PASS

- [ ] **Step 5: IPC + preload 노출**

`electron/ipc/index.ts` — import 추가(파일 상단 import 그룹에):
```ts
import { readWorktreeFile, writeWorktreeFile } from '../git/worktreeFile'
```
핸들러 추가(`git:markResolved` 핸들러 근처):
```ts
  ipcMain.handle('git:readWorktreeFile', (_e, repo: string, file: string) =>
    readWorktreeFile(repo, file),
  )
  ipcMain.handle('git:writeWorktreeFile', (_e, repo: string, file: string, content: string) =>
    writeWorktreeFile(repo, file, content),
  )
```

`electron/preload.ts` — `git` 객체에 추가(`markResolved` 근처):
```ts
    readWorktreeFile: (repo: string, file: string) =>
      ipcRenderer.invoke('git:readWorktreeFile', repo, file),
    writeWorktreeFile: (repo: string, file: string, content: string) =>
      ipcRenderer.invoke('git:writeWorktreeFile', repo, file, content),
```

- [ ] **Step 6: 타입 게이트 + 전체 테스트**

Run: `npx tsc --noEmit` (EXIT 0) 그리고 `npm run test` (전체 green)

- [ ] **Step 7: 커밋**

```bash
git add electron/git/worktreeFile.ts test/worktree-file.test.ts electron/ipc/index.ts electron/preload.ts
git commit -m "feat(merge): worktree file read/write + IPC exposure"
```

---

### Task 3: conflictStore 확장 + ConflictPanel "머지" 버튼

**Files:**
- Modify: `src/store/conflictStore.ts`, `src/components/ConflictPanel.tsx`

- [ ] **Step 1: `conflictStore.ts` 전체 교체**

```ts
import { create } from 'zustand'

// 'checkout' is special: a `git checkout -m` left conflict markers in the working tree.
// There is nothing to continue/commit — the user just resolves files and closes.
type Op = 'merge' | 'rebase' | 'cherry-pick' | 'checkout' | 'revert'

interface ConflictState {
  active: boolean
  op: Op | null
  files: string[]
  mergeFile: string | null // 3-pane 머지 뷰로 열려 있는 파일 (없으면 null)
  open: (op: Op, files: string[]) => void
  close: () => void
  openMerge: (file: string) => void
  closeMerge: () => void
}

export const useConflictStore = create<ConflictState>((set) => ({
  active: false,
  op: null,
  files: [],
  mergeFile: null,
  open: (op, files) => set({ active: true, op, files }),
  close: () => set({ active: false, op: null, files: [], mergeFile: null }),
  openMerge: (file) => set({ mergeFile: file }),
  closeMerge: () => set({ mergeFile: null }),
}))
```

- [ ] **Step 2: `ConflictPanel.tsx`에 "머지" 버튼 추가**

`const { active, op, files, open, close } = useConflictStore()` 줄을 다음으로 교체:
```ts
  const { active, op, files, open, close, openMerge } = useConflictStore()
```

파일 행에서 "에디터에서 열기" 버튼 바로 앞에 "머지" 버튼을 추가한다. 즉 이 블록:
```tsx
            <div key={f} className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 font-mono truncate">{f}</span>
              <button
                className="border dark:border-neutral-600 rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700"
                onClick={() => window.api.shell.openPath(`${repo}/${f}`)}
              >
                에디터에서 열기
              </button>
```
를 다음으로 교체(머지 버튼 1개 추가):
```tsx
            <div key={f} className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 font-mono truncate">{f}</span>
              <button
                className="border dark:border-neutral-600 rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700"
                onClick={() => openMerge(f)}
              >
                머지
              </button>
              <button
                className="border dark:border-neutral-600 rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700"
                onClick={() => window.api.shell.openPath(`${repo}/${f}`)}
              >
                에디터에서 열기
              </button>
```

- [ ] **Step 3: 타입 게이트**

Run: `npx tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 4: 커밋**

```bash
git add src/store/conflictStore.ts src/components/ConflictPanel.tsx
git commit -m "feat(merge): conflictStore mergeFile state + ConflictPanel merge button"
```

---

### Task 4: `MergeView` 3-pane 컴포넌트

**Files:**
- Create: `src/components/MergeView.tsx`

- [ ] **Step 1: 컴포넌트 생성** — `src/components/MergeView.tsx`

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { parseConflicts, buildMerged, type ParsedConflict, type ConflictSeg } from '../lib/mergeConflict'
import { withToast, useToast } from '../lib/api'

interface Props {
  repo: string
  file: string
  onClose: () => void
  onResolved: () => void
}

function Lines({ lines, tone }: { lines: string[]; tone: 'shared' | 'ours' | 'theirs' }) {
  const bg =
    tone === 'ours'
      ? 'bg-green-50 dark:bg-green-950/40'
      : tone === 'theirs'
        ? 'bg-blue-50 dark:bg-blue-950/40'
        : ''
  return (
    <div className={bg}>
      {lines.map((l, i) => (
        <div key={i} className="px-2 whitespace-pre">
          {l || ' '}
        </div>
      ))}
    </div>
  )
}

function Cell({ side, children }: { side: 'l' | 'm' | 'r'; children: ReactNode }) {
  const border = side !== 'r' ? 'border-r dark:border-neutral-700' : ''
  return <div className={`${border} min-w-0`}>{children}</div>
}

export function MergeView({ repo, file, onClose, onResolved }: Props) {
  const [parsed, setParsed] = useState<ParsedConflict | null>(null)
  const [resolutions, setResolutions] = useState<(string | null)[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const t = await withToast(() => window.api.git.readWorktreeFile(repo, file))
      if (cancelled) return
      if (t === undefined) {
        onClose()
        return
      }
      const p = parseConflicts(t)
      if (!p.ok) {
        useToast
          .getState()
          .show('이 파일은 3-pane 머지로 열 수 없습니다 (마커 없음/바이너리). 에디터에서 직접 해결하세요.')
        onClose()
        return
      }
      setParsed(p)
      setResolutions(new Array(p.conflictCount).fill(null))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, file])

  if (!parsed) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 text-white text-sm">
        불러오는 중…
      </div>
    )
  }

  const remaining = resolutions.filter((r) => r === null).length
  const setRes = (ci: number, val: string) =>
    setResolutions((prev) => {
      const next = [...prev]
      next[ci] = val
      return next
    })

  const save = async () => {
    const merged = buildMerged(parsed.segments, resolutions)
    const w = await withToast(() => window.api.git.writeWorktreeFile(repo, file, merged))
    if (w === undefined) return
    await withToast(() => window.api.git.markResolved(repo, [file]))
    onResolved()
  }

  // conflict 세그먼트 인덱스를 미리 매핑(shared는 -1).
  let counter = 0
  const segConflictIdx = parsed.segments.map((s) => (s.type === 'conflict' ? counter++ : -1))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex flex-col">
      <div className="bg-white dark:bg-neutral-900 dark:text-neutral-100 m-4 rounded-lg shadow-xl flex-1 flex flex-col min-h-0 text-xs">
        <div className="flex items-center justify-between px-4 py-2 border-b dark:border-neutral-700">
          <span className="font-semibold">충돌 머지 — {file}</span>
          <span className="text-gray-500 dark:text-neutral-400">남은 충돌 {remaining}개</span>
        </div>
        <div className="grid grid-cols-3 text-[11px] font-semibold text-center border-b dark:border-neutral-700">
          <div className="py-1 text-green-700 dark:text-green-400">내 것 · {parsed.oursLabel}</div>
          <div className="py-1">결과</div>
          <div className="py-1 text-blue-700 dark:text-blue-400">그쪽 · {parsed.theirsLabel}</div>
        </div>
        <div className="grid grid-cols-3 flex-1 overflow-auto font-mono leading-tight">
          {parsed.segments.flatMap((seg: ConflictSeg, si: number) => {
            if (seg.type === 'shared') {
              return [
                <Cell key={`l${si}`} side="l">
                  <Lines lines={seg.lines} tone="shared" />
                </Cell>,
                <Cell key={`m${si}`} side="m">
                  <Lines lines={seg.lines} tone="shared" />
                </Cell>,
                <Cell key={`r${si}`} side="r">
                  <Lines lines={seg.lines} tone="shared" />
                </Cell>,
              ]
            }
            const idx = segConflictIdx[si]
            const res = resolutions[idx]
            return [
              <Cell key={`l${si}`} side="l">
                <Lines lines={seg.ours} tone="ours" />
              </Cell>,
              <Cell key={`m${si}`} side="m">
                <div className="p-1 space-y-1">
                  <div className="flex gap-1">
                    <button
                      className="border dark:border-neutral-600 rounded px-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
                      onClick={() => setRes(idx, seg.ours.join('\n'))}
                    >
                      ◀ 내 것
                    </button>
                    <button
                      className="border dark:border-neutral-600 rounded px-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
                      onClick={() => setRes(idx, [...seg.ours, ...seg.theirs].join('\n'))}
                    >
                      둘 다
                    </button>
                    <button
                      className="border dark:border-neutral-600 rounded px-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
                      onClick={() => setRes(idx, seg.theirs.join('\n'))}
                    >
                      그쪽 것 ▶
                    </button>
                  </div>
                  <textarea
                    value={res ?? ''}
                    placeholder="충돌 미해결 — 버튼을 누르거나 직접 입력"
                    onChange={(e) => setRes(idx, e.target.value)}
                    className={`w-full border rounded p-1 font-mono resize-y min-h-[3em] dark:bg-neutral-950 ${
                      res === null ? 'border-amber-400' : 'border-neutral-300 dark:border-neutral-600'
                    }`}
                  />
                </div>
              </Cell>,
              <Cell key={`r${si}`} side="r">
                <Lines lines={seg.theirs} tone="theirs" />
              </Cell>,
            ]
          })}
        </div>
        <div className="flex justify-end gap-2 px-4 py-2 border-t dark:border-neutral-700">
          <button
            onClick={onClose}
            className="border dark:border-neutral-600 rounded px-3 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={remaining > 0}
            className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40"
          >
            저장 (해결됨 표시)
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입 게이트**

Run: `npx tsc --noEmit`
Expected: EXIT 0 (컴포넌트는 아직 미사용 — 컴파일만 통과)

- [ ] **Step 3: 커밋**

```bash
git add src/components/MergeView.tsx
git commit -m "feat(merge): 3-pane MergeView component"
```

---

### Task 5: `App.tsx` 연결

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: import 추가** (다른 컴포넌트 import 근처, 예: `ConflictPanel` import 아래)

```tsx
import { MergeView } from './components/MergeView'
```

- [ ] **Step 2: MergeView 렌더 추가** — 기존 `{repo && <ConflictPanel repo={repo} onDone={() => log.refresh(repo)} />}` 줄 바로 아래에 추가

```tsx
      {repo && conflict.mergeFile && (
        <MergeView
          repo={repo}
          file={conflict.mergeFile}
          onClose={conflict.closeMerge}
          onResolved={() => {
            conflict.closeMerge()
            log.refresh(repo)
          }}
        />
      )}
```

> 참고: `App`에는 이미 `const conflict = useConflictStore()`가 있으므로 `conflict.mergeFile`/`conflict.closeMerge`를 그대로 쓸 수 있다. 추가 상태 불필요.

- [ ] **Step 3: 타입 게이트**

Run: `npx tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 4: 커밋**

```bash
git add src/App.tsx
git commit -m "feat(merge): wire MergeView into App conflict flow"
```

---

### Task 6: 최종 검증

**Files:** (없음 — 검증)

- [ ] **Step 1: 전체 테스트**

Run: `npm run test`
Expected: PASS (기존 + merge-conflict + worktree-file 포함)

- [ ] **Step 2: 타입체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 둘 다 성공

- [ ] **Step 3: 수동 스모크** (`npm run dev`, 사용자 확인용 시나리오)

  - [ ] 충돌 유발(같은 줄을 수정한 두 브랜치 merge/rebase) → `ConflictPanel` 표시
  - [ ] 파일 행의 "머지" 버튼 → 3-pane 모달 열림 (좌 Ours / 중 Result / 우 Theirs, 충돌 구간 정렬)
  - [ ] hunk별 [◀ 내 것][둘 다][그쪽 것 ▶] 클릭 → 가운데 결과 반영, "남은 충돌" 감소
  - [ ] 가운데 직접 편집 가능
  - [ ] 모두 해결 시 "저장" 활성 → 저장하면 파일 해결됨 표시되고 모달 닫힘
  - [ ] `ConflictPanel`에서 continue로 머지 마무리
  - [ ] 마커 없는/바이너리 파일에서 "머지" → 토스트 안내 후 닫힘(폴백)

- [ ] **Step 4: 마무리 커밋(필요 시)**

```bash
git add -A && git commit -m "chore: finalize 3-pane merge conflict tool" || true
```

---

## Self-Review 결과

- **Spec 커버리지:** 파서(Task 1), 백엔드 read/write+IPC(Task 2), store/패널 버튼(Task 3), MergeView 3-pane+버튼+편집+저장(Task 4), App 연결(Task 5), 폴백(Task 4의 `!ok` 분기), 테스트(Task 1/2 + 수동). 모두 태스크 존재. ✅
- **Placeholder:** 없음(모든 코드 완전 기재).
- **타입/이름 일관성:** `ParsedConflict`/`ConflictSeg`/`parseConflicts`/`buildMerged`(Task 1) → MergeView(Task 4)에서 동일 import. `mergeFile`/`openMerge`/`closeMerge`(Task 3 store) → ConflictPanel(Task 3)·App(Task 5)에서 동일 사용. `readWorktreeFile`/`writeWorktreeFile`(Task 2) → IPC/preload/MergeView에서 동일. `markResolved`는 기존 API 재사용. 일관 확인.
