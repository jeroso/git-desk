# 3-pane 충돌 머지 도구 (MVP)

- 날짜: 2026-06-26
- 대상: git-desk (Electron + React + Zustand)
- 상태: 설계 승인됨, 구현 계획 작성 예정

## 1. 목표

병합/리베이스/체리픽/리버트 충돌 시, IntelliJ식 **3-pane(Ours · Result · Theirs)** 머지 화면을 클릭으로 해결할 수 있게 한다. 현재는 `ConflictPanel`에서 "에디터에서 열기 / 해결됨 표시 / continue / abort"만 가능 — 여기에 파일별 **머지 뷰**를 추가한다.

### 확정 범위 (MVP)
- 충돌 파일의 작업트리 마커(`<<<<<<< / ======= / >>>>>>>`, diff3의 `|||||||`도 파싱)를 파서로 분해.
- 3열 정렬 뷰 + hunk별 클릭 채택([◀ 내 것][둘 다][그쪽 것 ▶]) + 가운데 직접 편집 + 저장(파일 쓰기 + `git add`).
- 기존 `ConflictPanel`/continue·abort 흐름과 연결.

### 범위 밖 (YAGNI)
- 문법 하이라이트, 단어 단위 diff, base 패널 표시(파싱은 하되 화면엔 미표시).
- 코드 에디터 라이브러리(CodeMirror/Monaco) 도입.
- 바이너리/삭제충돌(modify-delete)/rename 충돌 → 3-pane 비활성, **기존 흐름으로 폴백**.

### 기본 결정
- 충돌 데이터는 **작업트리 파일 마커 파싱** 단일 소스(스테이지 `:1/:2/:3` 미사용).
- "둘 다"는 ours→theirs 순.
- 머지 뷰는 전체화면급 모달.
- 마커가 없거나 파싱 실패 → 폴백(토스트 안내 + 기존 버튼 사용).

## 2. 현재 코드 기준점

- `src/components/ConflictPanel.tsx`: `useConflictStore()`의 `{active, op, files}`로 충돌 파일 목록 표시. 행마다 "에디터에서 열기"(`shell.openPath`), "해결됨 표시"(`window.api.git.markResolved` → `refreshConflicts`). 하단 continue/abort.
- `src/store/conflictStore.ts`: `{ active, op, files, open, close }`. op 유니온 `'merge'|'rebase'|'cherry-pick'|'checkout'|'revert'`.
- `electron/git/ops.ts`: `markResolved(repo, files)` = `git add -- <files>`.
- `electron/git/exec.ts`: `git(cwd, args, opts?)`.
- IPC/preload 패턴: `git:<action>` (ipcMain.handle ↔ ipcRenderer.invoke), `src/types.ts`가 `Api` 타입 재노출.
- `src/App.tsx`: `<ConflictPanel repo onDone={() => log.refresh(repo)} />` 렌더.
- 스타일: `DiffView`처럼 모노스페이스 + 라인 색 강조. 코드 에디터/하이라이터 없음(의존성: react, react-dom, zustand만).

## 3. 아키텍처 개요

```
ConflictPanel (파일 행)
  └─ "머지" 버튼 → conflictStore.openMerge(file)
        │
        ▼
  App에서 mergeFile 있으면 <MergeView repo file ...> (전체화면 모달)
        │  1. window.api.git.readWorktreeFile(repo, file) → 원문
        │  2. parseConflicts(text) → segments  (순수 함수)
        │     - 마커 없음/바이너리/파싱실패 → 폴백(닫고 토스트)
        │  3. 3열 그리드 렌더(세그먼트=그리드 행, 셀 높이 자동 정렬 → 스크롤 동기 자동)
        │  4. hunk별 채택 버튼/직접 편집 → 결과 텍스트 구성
        │  5. 저장: buildMerged(segments, resolutions) →
        │       writeWorktreeFile(repo, file, text) → markResolved(repo,[file])
        │       → closeMerge() → onDone(refresh) → ConflictPanel로 복귀
```

## 4. 충돌 마커 파서 (`src/lib/mergeConflict.ts`, 순수 함수)

```ts
export type ConflictSeg =
  | { type: 'shared'; lines: string[] }
  | { type: 'conflict'; ours: string[]; theirs: string[]; base?: string[] }

export interface ParsedConflict {
  segments: ConflictSeg[]
  conflictCount: number
  oursLabel: string   // <<<<<<< 뒤 라벨 (예: HEAD)
  theirsLabel: string // >>>>>>> 뒤 라벨 (예: feature)
  ok: boolean         // false면 마커 없음/불균형 → 폴백
}

export function parseConflicts(text: string): ParsedConflict
export function buildMerged(segments: ConflictSeg[], resolutions: (string | null)[]): string
```

- 라인 분해는 `\n` 기준, 마지막 개행 보존(파일 끝 처리). CRLF는 라인에 `\r` 포함된 채 유지(원문 보존; MVP는 LF 가정, CRLF도 깨지지 않게 통과).
- 상태 기계: 일반 → `<<<<<<< `에서 conflict.ours 수집 → `||||||| `면 base 수집 → `=======`에서 theirs 수집 → `>>>>>>> `에서 conflict 종료. 중첩/불균형이면 `ok:false`.
- 연속 일반 라인은 하나의 `shared` 세그먼트로 묶음.
- `conflictCount` = conflict 세그먼트 수. 0이면 `ok:false`(폴백).
- `buildMerged`: conflict 세그먼트 i의 결과 = `resolutions[i]`(여러 줄 문자열), shared는 그대로. resolutions에 null이 있으면(미해결) 호출 안 함(저장은 전부 해결 시에만).

## 5. UI: `MergeView` (`src/components/MergeView.tsx`)

- props: `{ repo: string; file: string; onClose: () => void; onResolved: () => void }`.
- 마운트 시 파일 읽기→파싱. `!ok` → 토스트("이 파일은 3-pane으로 열 수 없습니다 — 에디터에서 직접 해결하세요") 후 `onClose()`.
- 상태: `resolutions: (string|null)[]` (conflict 세그먼트별), 초기 전부 `null`(미해결).
- 레이아웃: 전체화면 모달(`fixed inset-0 bg-black/40`), 내부 카드. 헤더에 파일명 + Ours/Result/Theirs 라벨. 본문은 단일 스크롤 컨테이너의 **3열 CSS 그리드**(`grid-template-columns: 1fr 1fr 1fr`):
  - 세그먼트마다 3개 셀(ours/result/theirs)을 같은 그리드 행에 배치 → 행 높이가 가장 큰 셀에 맞춰져 **자동 정렬**, 한 컨테이너라 스크롤도 자동 동기화.
  - `shared` 세그먼트: 세 셀 모두 동일 라인(회색 톤), 결과 셀도 동일 표시(읽기전용).
  - `conflict` 세그먼트: ours 셀(좌, 초록 톤 강조) · theirs 셀(우, 파랑 톤 강조) · result 셀(중앙):
    - 미해결: 버튼 행 [◀ 내 것][둘 다][그쪽 것 ▶] + 작은 textarea(빈/플레이스홀더). 버튼 클릭 시 textarea 값 = ours/`ours+theirs`/theirs, 해당 인덱스 resolved.
    - textarea 직접 편집도 가능(편집하면 resolved 처리). 값 = `resolutions[i]`.
- 하단: "남은 충돌 N개" 표시. 모두 해결(`resolutions`에 null 없음)되면 **저장** 활성. 저장 → `buildMerged` → `writeWorktreeFile` → `markResolved` → `onResolved()` → `onClose()`. "취소" 버튼은 변경 없이 닫기(파일 미수정).
- 스타일: 모노스페이스, 라인 단위 `<div>`(DiffView와 동일 톤). 하이라이트 없음.

## 6. 상태 연결 (`conflictStore` 확장)

```ts
interface ConflictState {
  active: boolean
  op: Op | null
  files: string[]
  mergeFile: string | null     // 추가
  open: (op: Op, files: string[]) => void
  close: () => void
  openMerge: (file: string) => void   // 추가
  closeMerge: () => void              // 추가
}
```
- `close()`는 `mergeFile`도 초기화.
- `ConflictPanel` 행에 "머지" 버튼 → `openMerge(f)`.
- `App`에서 `mergeFile`이 있으면 `<MergeView repo file={mergeFile} onClose={closeMerge} onResolved={() => { closeMerge(); log.refresh(repo) }} />` 렌더. (저장 시 파일 목록 갱신은 ConflictPanel의 refreshConflicts와 동일 효과 — onResolved에서 refresh)

## 7. 백엔드 (작음)

`electron/git/worktreeFile.ts` (신규):
```ts
export async function readWorktreeFile(repo: string, file: string): Promise<string>   // fs.readFile(join(repo,file),'utf8')
export async function writeWorktreeFile(repo: string, file: string, content: string): Promise<void> // fs.writeFile
```
- 경로 안전: `path.join(repo, file)`. (file은 git이 준 repo-상대 경로)
- IPC: `git:readWorktreeFile(repo, file)`, `git:writeWorktreeFile(repo, file, content)`. preload 미러.
- 저장 후 해결 표시는 **기존 `markResolved`**(`git:markResolved`) 재사용 — 신규 불필요.

## 8. 테스트

- **`mergeConflict` 파서 (유닛, 순수)**: 기본 마커 / diff3(`|||||||`) / 다중 hunk / 마커 없음→`ok:false` / 불균형 마커→`ok:false` / 라벨 추출 / `buildMerged` 결과(개행 보존). `test/merge-conflict.test.ts`.
- **백엔드 read/write (real-git 통합)**: 임시 repo에서 충돌 유발(같은 줄 수정한 두 브랜치 merge) → `readWorktreeFile`로 마커 포함 원문 확인 → `writeWorktreeFile`로 결과 쓰고 `markResolved` 후 `getStatus`에 conflicted 없음 확인. `test/worktree-file.test.ts`.
- **React 컴포넌트**: 자동 테스트 인프라 없음 → `npx tsc --noEmit` + 수동 스모크.

## 9. 변경/신규 파일 요약

**신규**
- `src/lib/mergeConflict.ts` (+ `test/merge-conflict.test.ts`)
- `src/components/MergeView.tsx`
- `electron/git/worktreeFile.ts` (+ `test/worktree-file.test.ts`)

**수정**
- `src/store/conflictStore.ts` (mergeFile + openMerge/closeMerge)
- `src/components/ConflictPanel.tsx` ("머지" 버튼)
- `src/App.tsx` (MergeView 렌더 연결)
- `electron/ipc/index.ts`, `electron/preload.ts` (read/writeWorktreeFile 노출)

## 10. 검증 게이트 (중요)
- 이 repo의 `npm run typecheck`는 기존 깨짐(불관련) → 타입 게이트는 **`npx tsc --noEmit`**(main tsconfig, src+electron 커버) 사용.
- 테스트: `npm run test`.
- 최종: `npm run build` + 사용자가 `npm run dev`로 수동 스모크(충돌 유발 후 머지 뷰 확인).
