# IntelliJ-style 커밋 작업 (Reset / Revert / Undo / Edit message / Drop / Squash)

- 날짜: 2026-06-26
- 대상: git-desk (Electron + React + Zustand)
- 상태: 설계 승인됨, 구현 계획 작성 예정

## 1. 목표

커밋 그래프에서 커밋(들)을 우클릭했을 때 IntelliJ의 git 로그 컨텍스트 메뉴와 동등한 작업을 제공한다.

**단일 커밋:**
- Reset Current Branch to Here… (Soft / Mixed / Hard 모드 선택)
- Edit Commit Message…
- Undo Commit (tip 커밋 한정)
- Revert Commit
- Drop Commit
- Cherry-Pick (기존)

**다중 선택 (cmd/shift):**
- Cherry-Pick N commits (기존)
- Revert N commits
- Drop N commits
- Squash N commits (연속 선택 한정)

### 확정된 설계 결정
1. **Reset 모드**: Soft / Mixed / Hard 세 가지를 다이얼로그에서 선택.
2. **재작성 범위**: 모든 커밋 — 중간 커밋도 처리하는 non-interactive `rebase -i` 엔진 사용.
3. **푸시 보호**: 이미 원격에 푸시(게시)된 커밋을 재작성/리셋하려 하면 경고 모달을 띄우고, 사용자가 확인하면 진행.

### 범위 밖 (YAGNI)
- 선택에 머지 커밋이 포함된 경우의 rebase (first-parent 선형 가정).
- 비연속(non-contiguous) squash.
- 커밋 순서 변경(reorder).

## 2. 현재 코드 기준점 (정확한 참조)

- git 실행 단일 통로: `electron/git/exec.ts` → `git(cwd, args)`. **현재 `env`/옵션을 받지 않음.**
- 고급 작업 래퍼: `electron/git/ops.ts` → `tryOp(repo, args)`가 성공/충돌을 `{ ok, output }`로 반환. `mergeBranch`/`rebaseOnto`/`cherryPick`/`continueOp`/`abortOp`/`smartCheckout`/`rollback`.
- 충돌 op 유니온은 현재 `'merge' | 'rebase' | 'cherry-pick'` (+ UI에서 `'checkout'`). 다음 위치에 동일하게 존재:
  - `electron/git/ops.ts` `continueOp`/`abortOp`
  - `electron/preload.ts` `continueOp`/`abortOp`
  - `electron/ipc/index.ts` `git:continueOp`/`git:abortOp`
  - `src/store/conflictStore.ts` `Op`
  - `src/components/ConflictPanel.tsx` `resumeOp` 캐스트
  - `src/App.tsx` `runOp`의 op 파라미터
- 커밋 데이터: `electron/git/types.ts`의 `Commit extends RawCommit { parents: string[]; refs: string[]; ... }`. `refs`는 `["HEAD -> main", "origin/main", ...]` 형태 → **렌더러에서 HEAD/푸시 여부 일부 추정 + 부모 링크로 연속성 판정 가능.**
- 커밋 그래프 UI: `src/components/CommitGraph/index.tsx`. 멀티선택(`selected: Set`, `anchor`)과 `indexOf` 맵이 이미 있음. 우클릭은 현재 `window.confirm` 기반 cherry-pick만.
- 커스텀 컨텍스트 메뉴 패턴: `src/components/BranchContextMenu.tsx` (뷰포트 클램프 + 오버레이 클릭 닫기 + items 배열 + divider).
- 작업 오케스트레이션: `src/App.tsx`의 `runOp(repoPath, fn, op)` — `fn` 실행 → status 재조회로 conflicted 파일 검출 → 있으면 `conflict.open(op, files)`로 `ConflictPanel` 띄움, 없고 실패면 토스트, 성공이면 `notify`, 마지막에 `log.refresh`.
- 충돌 해결 패널: `src/components/ConflictPanel.tsx` — `git add`(해결됨 표시) / `--continue` / `--abort`.

## 3. 아키텍처 개요

```
CommitGraph (우클릭)
  └─> CommitContextMenu (신규)  ── 항목 활성화 판정(단일/연속/tip/현재브랜치) ──┐
                                                                              │
  ┌───────────────────────── 액션 콜백 (App.tsx에서 주입) ───────────────────┘
  │
  ├─ 재작성/리셋이면: isPushed 확인 → 푸시됐으면 RewriteWarningDialog
  │
  ├─ Reset    → ResetModeDialog → window.api.git.reset(repo, hash, mode)        [plain]
  ├─ Undo     → window.api.git.undoCommit(repo, hash)                            [plain]
  ├─ Edit msg → EditMessageDialog → window.api.git.editMessage(repo, hash, msg)  [runOp 'rebase']
  ├─ Revert   → window.api.git.revert(repo, hashes)                              [runOp 'revert']
  ├─ Drop     → window.api.git.rebaseEdit(repo, {kind:'drop', hashes})           [runOp 'rebase']
  ├─ Squash   → SquashMessageDialog → rebaseEdit(repo,{kind:'squash',hashes,msg})[runOp 'rebase']
  └─ CherryPick → 기존 cherryPick                                                [runOp 'cherry-pick']
```

- **plain** = 충돌 불가. 단순 `git()` 호출, 에러는 `withToast`로 토스트, 성공 시 `notify`, `log.refresh`.
- **runOp** = 충돌 가능. 기존 `runOp`를 통해 `ConflictPanel`과 통합.

## 4. 백엔드 (electron) 변경

### 4.1 `exec.ts` — env 지원 추가
`git()`에 선택적 옵션 파라미터를 추가한다 (기존 호출부 무영향, 하위호환):

```ts
export async function git(
  cwd: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv },
): Promise<string> {
  // execFile 옵션에 env: { ...process.env, ...opts?.env } 병합
}
```

### 4.2 `ops.ts` — 단순 작업 추가
```ts
// 충돌 불가. plain string 반환.
export function resetTo(repo: string, hash: string, mode: 'soft' | 'mixed' | 'hard') {
  return git(repo, ['reset', `--${mode}`, hash])
}

// Undo Commit: tip 커밋(들)을 무르되 변경분은 staged로 보존. hash = 되돌릴 가장 오래된 커밋.
export function undoCommit(repo: string, hash: string) {
  return git(repo, ['reset', '--soft', `${hash}^`])
}

// 충돌 가능 → tryOp. hashes: newest→oldest 순서로 전달받음.
export function revertCommits(repo: string, hashes: string[]) {
  return tryOp(repo, ['revert', '--no-edit', ...hashes])
}
```

`continueOp`/`abortOp`의 op 유니온에 `'revert'` 추가:
```ts
export function continueOp(repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') {
  const args = op === 'merge' ? ['commit', '--no-edit'] : [op, '--continue']
  return tryOp(repo, args)
}
export function abortOp(repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') {
  return tryOp(repo, [op, '--abort'])
}
```

### 4.3 `rebaseEdit.ts` (신규) — non-interactive rebase 엔진
Drop / Squash / Reword(중간 커밋 포함)를 단일 메커니즘으로 처리한다.

**핵심 메커니즘**
1. `base` 결정 = 가장 오래된 대상 커밋의 부모. 루트 커밋이면 `--root` 사용.
2. `git log --reverse --format=%H <base>..HEAD`로 base 위 커밋들을 **oldest→newest 순서**로 확보.
3. 요청 종류에 따라 rebase todo 텍스트를 생성:
   - **drop**: 대상 hash는 `drop <sha>`, 나머지는 `pick <sha>`.
   - **reword**: 대상은 `pick <sha>` 다음 줄에 `exec git commit --amend -m '<escaped>'`, 나머지 `pick`.
   - **squash**: 연속 그룹의 첫 커밋 `pick <sha>`, 이후 멤버 `fixup <sha>`, 그룹 마지막 뒤에 `exec git commit --amend -m '<escaped combined>'`. 그룹 밖은 `pick`.
4. todo 텍스트를 임시파일(`fs.mkdtempSync`)에 쓰고, `GIT_SEQUENCE_EDITOR='cp <quoted todoPath>'` env로 git의 todo를 덮어쓴다.
5. 실행: `git(repo, ['-c', 'core.editor=true', 'rebase', '-i', '--autostash', base], { env })` (루트면 base 대신 `--root`).
6. **초기 명령이 반환된 직후 todo 임시파일 삭제** — git이 이미 자기 todo로 복사했고, 메시지는 `exec ... -m` 인라인이라 이후 `--continue` 시점에 잔존 파일이 필요 없다.
7. 결과는 `tryOp`와 동일한 `{ ok, output }`. 충돌 시 op=`'rebase'`로 기존 `ConflictPanel`이 `git rebase --continue/--abort` 처리.

**메시지 escape**: 단일 따옴표 셸 컨텍스트로 감싼다 — `'` → `'\''` 치환 후 전체를 `'...'`로 감쌈. 작은따옴표 안에서는 개행도 그대로 보존되므로 임의 커밋 메시지(개행/특수문자 포함) 안전.

```ts
type RebaseEditRequest =
  | { kind: 'drop'; hashes: string[] }            // 연속/비연속 모두
  | { kind: 'reword'; hash: string; message: string }
  | { kind: 'squash'; hashes: string[]; message: string } // 연속 보장(렌더러)

export async function rebaseEdit(
  repo: string,
  req: RebaseEditRequest,
): Promise<{ ok: boolean; output: string }>
```

**한계(문서화)**: drop 후 어떤 커밋이 비게 되면(`nothing to commit`) rebase가 멈춘다. 이는 충돌이 아니라 일반 실패로 출력에 노출된다.

### 4.4 `isPushed` (push 보호)
`branch.ts` 또는 `ops.ts`에 추가:
```ts
export async function isPushed(repo: string, hash: string): Promise<boolean> {
  const out = await git(repo, ['branch', '-r', '--contains', hash])
  return out.trim().length > 0
}
```

### 4.5 `editMessage` 라우팅 (main에서 분기)
렌더러 분기를 줄이기 위해 main에서 HEAD 여부로 분기, 항상 `{ ok, output }` 반환:
```ts
export async function editMessage(repo: string, hash: string, message: string) {
  const head = (await git(repo, ['rev-parse', 'HEAD'])).trim()
  if (hash === head) {
    return tryOp(repo, ['commit', '--amend', '-m', message]) // 빠른 경로, 충돌 없음
  }
  return rebaseEdit(repo, { kind: 'reword', hash, message })  // 중간 커밋
}
```

### 4.6 IPC + preload
`electron/ipc/index.ts`에 핸들러 추가, `electron/preload.ts`에 브릿지 추가 (기존 `git:*` 네이밍):

| IPC | 시그니처 | 반환 |
|-----|----------|------|
| `git:reset` | `(repo, hash, mode)` | string |
| `git:undoCommit` | `(repo, hash)` | string |
| `git:editMessage` | `(repo, hash, message)` | `{ ok, output }` |
| `git:revert` | `(repo, hashes[])` | `{ ok, output }` |
| `git:rebaseEdit` | `(repo, req)` | `{ ok, output }` |
| `git:isPushed` | `(repo, hash)` | boolean |

`git:continueOp` / `git:abortOp`의 op 타입에 `'revert'` 추가 (preload, ipc 동일).

## 5. 프런트엔드 (React) 변경

### 5.1 `runOp` 확장 (`App.tsx`)
- op 유니온에 `'revert'` 추가.
- 성공 토스트 문구를 위해 선택적 `label` 인자 추가 (기본은 op 문자열). 예: editMessage는 op=`'rebase'`, label=`'커밋 메시지 수정'`.

### 5.2 충돌 인프라에 `'revert'` 추가
- `src/store/conflictStore.ts`의 `Op`에 `'revert'`.
- `src/components/ConflictPanel.tsx`의 `resumeOp` 캐스트 타입에 `'revert'` (UI 문구는 op 그대로 노출).

### 5.3 선택 판정 헬퍼 (`src/lib/commitSelection.ts` 신규, 순수 함수)
렌더러에서 `commits`(부모 포함) + `selected` + HEAD로 계산:
- `headHash(commits)`: `refs`에 `HEAD`가 포함된 커밋의 hash (없으면 null; detached도 `HEAD` 토큰으로 검출).
- `isOnCurrentBranch(selected, ...)`: 선택 커밋들이 모두 HEAD의 first-parent 조상 범위에 있는지 (재작성 가능 전제).
- `isContiguousFromHead(selected, ...)`: HEAD에서 first-parent로 내려가며 선택 집합과 정확히 일치하는 연속 tip인지 → **Undo Commit 활성 조건**.
- `isContiguousRange(selected, ...)`: 선택을 index 순으로 정렬했을 때 각 인접 쌍이 `a.parents[0] === b.hash`인 선형 연속인지 → **Squash 활성 조건**. (머지 커밋 포함 시 false)
- `orderedOldestToNewest(selected, indexOf)`: 기존 cherry-pick과 동일한 정렬(큰 index=오래됨).

### 5.4 `CommitContextMenu.tsx` (신규)
`BranchContextMenu` 패턴(뷰포트 클램프, 오버레이 닫기, items+divider)을 그대로 따른다. props로 단일/다중 여부와 활성화 플래그, 액션 콜백을 받는다.

- 단일 선택: Reset…, Edit Message…, Undo Commit(`isContiguousFromHead`일 때만), Revert, Drop, Cherry-Pick, divider, Copy Revision Hash.
- 다중 선택: Cherry-Pick N, Revert N, Drop N, Squash N(`isContiguousRange`일 때만).
- 재작성/리셋 계열은 `isOnCurrentBranch`가 아니면 비활성.

### 5.5 `CommitGraph/index.tsx` 수정
- `window.confirm` 제거. `onContextMenu`에서 우클릭 좌표와 대상(단일 또는 멀티)을 저장하고 `CommitContextMenu`를 렌더.
- `onCherryPick` 단일 콜백을 액션별 콜백 묶음으로 교체:
  `onReset, onUndo, onEditMessage, onRevert, onDrop, onSquash, onCherryPick`.
- 우클릭이 멀티선택 내부면 선택 집합 전체를, 아니면 해당 커밋을 대상으로 한다(기존 규칙 유지).

### 5.6 다이얼로그 컴포넌트 (신규)
- `ResetModeDialog`: Soft / Mixed / Hard 라디오 + 각 모드 설명. 확인 시 모드 반환.
- `EditMessageDialog`: textarea, 기존 subject prefill.
- `SquashMessageDialog`: textarea, 선택 커밋 메시지들을 개행으로 결합해 prefill.
- `RewriteWarningDialog`: "이미 원격에 푸시된 이력을 재작성합니다" 경고 + 진행/취소. (reset/undo/drop/squash/edit 공용)

### 5.7 액션 흐름 (`App.tsx`에서 콜백 주입)
- **Reset**: ResetModeDialog → (isPushed(headHash) 시 경고) → `git.reset` → notify → refresh.
- **Undo**: (isPushed(headHash) 시 경고) → `git.undoCommit(oldestSelected)` → notify → refresh.
- **Edit Message**: EditMessageDialog → (HEAD 아니고 isPushed 시 경고) → `runOp(() => git.editMessage(repo, hash, msg), 'rebase', '커밋 메시지 수정')`.
- **Revert**: `runOp(() => git.revert(repo, orderedNewestToOldest), 'revert', '되돌리기')`. (revert는 push 경고 불필요 — 새 커밋 추가)
- **Drop**: (isPushed(oldestSelected) 시 경고) → `runOp(() => git.rebaseEdit(repo, {kind:'drop', hashes}), 'rebase', '드롭')`.
- **Squash**: SquashMessageDialog → (isPushed(oldestSelected) 시 경고) → `runOp(() => git.rebaseEdit(repo, {kind:'squash', hashes, message}), 'rebase', 'Squash')`.
- **Cherry-Pick**: 기존 유지.

**푸시 경고 규칙 요약**: 재작성/리셋 직전 `git.isPushed(repo, relevantHash)` 호출 — drop/squash/edit는 `oldestSelected`, reset/undo는 `headHash`. true면 `RewriteWarningDialog`로 확인 후 진행.

## 6. 충돌 흐름 통합

- drop / squash / reword(중간) / editMessage(중간) → 내부 `rebase` → op=`'rebase'` → `ConflictPanel`이 `git rebase --continue/--abort`.
- revert → op=`'revert'` → `ConflictPanel`이 `git revert --continue/--abort`.
- `exec ... --amend -m` 라인은 git todo에 인라인되어 `--continue` 시 자동 실행 (외부 임시파일 의존 없음).

## 7. 테스트 (`test/`, real-git 통합 패턴)

임시 repo를 만들어 검증:
- reset: soft/mixed/hard 각각 HEAD 위치와 worktree/index 상태 확인.
- undoCommit: tip 커밋 제거 + 변경분 staged 보존 확인.
- editMessage: HEAD(amend 경로) / 중간 커밋(rebase reword 경로) 메시지 변경, 개행·따옴표 포함 메시지.
- revert: 단일/다중, 충돌 케이스에서 `{ ok:false }` + status conflicted.
- rebaseEdit drop: tip / 중간 / 비연속 다중.
- rebaseEdit squash: 연속 2개+ 결합 및 메시지 적용.
- isPushed: 로컬 전용 커밋 false, 원격 추적에 포함된 커밋 true (로컬 bare remote로 시뮬레이션).
- 선택 헬퍼(`commitSelection`): 순수 함수 단위 테스트 (tip/연속/현재브랜치 판정).

## 8. 변경 파일 요약

**신규**
- `electron/git/rebaseEdit.ts`
- `src/components/CommitContextMenu.tsx`
- `src/components/ResetModeDialog.tsx`
- `src/components/EditMessageDialog.tsx`
- `src/components/SquashMessageDialog.tsx`
- `src/components/RewriteWarningDialog.tsx`
- `src/lib/commitSelection.ts`
- 관련 테스트 파일

**수정**
- `electron/git/exec.ts` (env 옵션)
- `electron/git/ops.ts` (resetTo/undoCommit/revertCommits, continue/abort에 revert)
- `electron/git/branch.ts` 또는 `ops.ts` (isPushed), `editMessage` 라우팅
- `electron/ipc/index.ts`, `electron/preload.ts` (신규 핸들러 + revert op)
- `src/App.tsx` (runOp 확장 + 콜백 주입)
- `src/components/CommitGraph/index.tsx` (컨텍스트 메뉴 통합)
- `src/store/conflictStore.ts`, `src/components/ConflictPanel.tsx` (revert op)
- `src/types.ts` (필요 시 Api 타입 미러)
