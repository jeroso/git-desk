# 브랜치 UX 개선 + updateBranch 버그 수정 설계

날짜: 2026-06-24

네 가지 작업: (1) `updateBranch` 버그 수정, (2) Commit 탭 복수 선택 롤백,
(3) 체크아웃 충돌 → 스마트/강제 머지, (4) TopBar 현재 브랜치 표시.

## #1 updateBranch 버그 (근본 수정)

**증상:** `git fetch origin main:main failed: refusing to fetch into branch
'refs/heads/main' checked out at '...'`

**원인:** 백엔드 `updateBranch(repo, branch, isCurrent)`가 UI에서 내려준 `isCurrent`에
의존한다. 브랜치 목록이 stale하면 실제로는 현재 브랜치인데 `isCurrent=false`가 내려와
`git fetch origin <b>:<b>`를 실행 → 체크아웃된 브랜치 ref엔 fetch가 거부됨.

**수정:** 시그니처를 `updateBranch(repo, branch)`로 줄이고, 백엔드가 실행 시점에
`rev-parse --abbrev-ref HEAD`로 현재 브랜치를 직접 판정한다. 같으면 `git pull`,
다르면 `git fetch origin <b>:<b>`. UI의 stale 상태에 의존하지 않는다. fetch가
"checked out" 사유로 실패하면(다른 worktree에 체크아웃된 경우) 친절한 메시지로 변환.

## #2 Commit 탭 복수 선택 롤백

선택 상태(`checked` Set)는 그대로 두고 범위 선택을 추가한다.

- 순수 함수 `rangeBetween(paths, anchor, target)`로 두 경로 사이 구간 산출 → 단위 테스트.
- `commitStore`: `anchor` 인덱스 추적, `selectRange(path)`(anchor~path를 checked에 추가),
  `toggleOne(path)`(단일 토글 + anchor 갱신) 추가.
- CommitView 행: 일반 클릭=diff 보기+anchor, Shift+클릭=범위 추가, Cmd/Ctrl+클릭=토글.
  체크박스/Rollback 버튼은 기존 유지(백엔드 rollback은 이미 다중 경로 지원).

## #3 체크아웃 충돌 → 선택 다이얼로그

`onCheckout`이 일반 `git checkout` 실패("would be overwritten by checkout"류)를 잡으면
`CheckoutConflictDialog`(스마트/강제/취소)를 띄운다.

- **스마트:** `git checkout -m <local>` (현재·작업트리·대상 3-way 머지). stash/pop을 쓰지
  않으므로 충돌 시 작업트리에 충돌 마커만 남고 대상 브랜치로 전환된다. 충돌 파일이 있으면
  `ConflictPanel`을 신규 `'checkout'` 모드로 연다.
- **강제:** 확인 후 `git checkout -f <local>` (로컬 변경 폐기).
- `ops.ts`에 `smartCheckout`(tryOp 기반, 충돌에도 throw 안 함) 추가.
- `conflictStore` op 타입에 `'checkout'` 추가. `ConflictPanel`은 checkout 모드에서
  continue/abort 대신 "완료" 버튼만 노출(체크아웃엔 commit/continue 개념이 없음).
  파일별 "해결됨 표시"=`git add`는 공통.

## #4 TopBar 현재 브랜치 표시

`logStore`에 `currentBranch: string | null` 추가, `refresh`에서 branches의 `isCurrent`로
산출(없으면 detached → `null`). TopBar에 저장소 선택 옆 `⎇ <브랜치>` 칩 상시 표시.

## 테스트

- `test/branch.test.ts`(실 git): `updateBranch` 현재/비현재 분기, `smartCheckout`의
  충돌/비충돌 동작.
- `test/select.test.ts`: `rangeBetween` 순수 함수 단위 테스트.
