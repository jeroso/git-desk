# git-desk — 설계 문서

작성일: 2026-06-11

## 1. 개요

IntelliJ의 Git 도구창을 그대로 재현한 커스텀 데스크톱 Git 클라이언트. GitHub Desktop 대체용으로,
사용자 취향(IntelliJ 스타일 4분할 로그 + 커밋 창 + 다중 SSH 계정 관리)에 맞춰 제작한다.

기존 프로젝트(`video-finder`, `cardnews-maker`)와 동일한 스택·구조를 따른다.

- **스택:** Electron + Vite + React + TypeScript + Tailwind + zustand
- **구조:** `electron/`(메인 프로세스) + `src/`(렌더러)
- **git 실행 방식:** 시스템 `git` CLI를 `child_process.execFile`로 직접 호출하고 porcelain 출력을
  파싱한다. `~/.ssh/config`·자격증명·git 설정을 그대로 존중하므로 다중 SSH 계정이 별도 처리 없이
  동작한다. (`isomorphic-git`은 SSH config 지원이 약해 탈락, `simple-git`은 의존성만 늘어 미채택)

## 2. v1 범위

- **히스토리 뷰** — IntelliJ Log 4분할: 브랜치 → 커밋(그래프) → 변경 파일 → diff
- **커밋 창** — working tree 변경 파일 체크박스 선택 → `Commit` / `Commit and Push`
- **브랜치 우클릭 메뉴** — Checkout / Merge into Current / Rebase Current onto Selected / Cherry-pick
- **충돌 처리** — 충돌 파일 목록 표시 + 외부 에디터 열기 / 해결됨 표시(`git add`) / 전체 continue·abort
  - ※ 3-way 병합 에디터는 **v2로 연기**
- **원격 작업** — Fetch / Pull / Push
- **다중 SSH 계정** — `~/.ssh/config`를 읽어 Host 별칭(계정) 목록 제공, 프로젝트별로 계정을 고르면
  원격 URL의 호스트 별칭을 자동 재작성(`git remote set-url`)
- **저장소 관리** — 최근 연 저장소 목록 + 폴더 추가로 전환

### v2 이후 (범위 외)

- 3-way 병합 충돌 에디터
- stash 관리 UI
- (그 외 추후 결정)

## 3. 화면 레이아웃

### (A) Log 뷰 — 메인

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [▼ my-project ⌄]  repo 전환     [Fetch] [Pull] [Push ↑2]      [⚙ Remote]  │
├────────────┬─────────────────────────────────────┬─────────────────────────┤
│ BRANCHES   │ COMMITS                             │ CHANGED FILES           │
│ 🔍 filter  │ ● Fix login bug      yw   2h ago    │  M  src/auth.ts         │
│ ▾ Local    │ │● Add API endpoint  yw   5h ago    │  A  src/login.tsx       │
│  ● main    │ ●│ Merge PR #12       yw   1d ago    │  D  old/legacy.js       │
│  ○ feature │ │●  Refactor store   yw   2d ago    │                         │
│ ▾ Remote   │ ●   Init commit      yw   3d ago    │                         │
│  ○ origin/ │                                     │                         │
│            ├─────────────────────────────────────┴─────────────────────────┤
│ (브랜치    │ DIFF — src/auth.ts                          [통합 ⇄ 좌우]     │
│  우클릭→   │   12  - const old = doLogin()                                  │
│  Checkout  │   12  + const next = doLogin(opts)                            │
│  Merge     │   13    return next                                           │
│  Rebase    │                                                               │
│  Cherry..) │                                                               │
└────────────┴───────────────────────────────────────────────────────────────┘
```

좌측 브랜치 선택 → 가운데 커밋 그래프 → 커밋 선택 시 우측 변경 파일 → 파일 선택 시 하단 diff.

### (B) Commit 뷰 — IntelliJ 커밋 창

```
┌────────────┬─────────────────────────────────────┬─────────────────────────┐
│ BRANCHES   │ CHANGES (working tree)              │ DIFF — src/auth.ts      │
│ (동일)     │ ☑ M src/auth.ts                     │   - old line            │
│            │ ☑ A src/login.tsx                   │   + new line            │
│            │ ☐ M README.md                       │                         │
│            │ ☐ ?? scratch.txt (untracked)        │                         │
│            ├─────────────────────────────────────┤                         │
│            │ 커밋 메시지...                      │                         │
│            │ [________________________________]  │                         │
│            │  [ Commit ]  [ Commit and Push ⌄ ]  │                         │
└────────────┴─────────────────────────────────────┴─────────────────────────┘
```

### (C) Remote / SSH 계정 관리

```
┌─ Remote & Account ─────────────────────────────────┐
│ Remote: origin                                      │
│ URL: git@github-work:myorg/my-project.git           │
│                                                     │
│ 계정 (~/.ssh/config 에서 읽음):                     │
│   ( ) github-personal   →  git@github.com           │
│   (●) github-work       →  git@github.com (id_work) │
│   ( ) github-side       →  git@github.com           │
│                                                     │
│ 계정 선택 시 URL의 호스트 별칭이 자동 변경됩니다.   │
│            [ 적용 (set-url) ]   [ 취소 ]            │
└─────────────────────────────────────────────────────┘
```

## 4. 아키텍처 & 폴더 구조

```
git-desk/
├ electron/                    # 메인 프로세스
│  ├ main.ts                   # 윈도우 생성, 앱 라이프사이클
│  ├ preload.ts                # window.api 브릿지 (contextBridge)
│  ├ git/
│  │  ├ exec.ts                # execFile('git', args, {cwd}) 래퍼 — 모든 git 호출의 단일 통로
│  │  ├ log.ts                 # git log 파싱 (hash, parents, refs, author, date, subject)
│  │  ├ graph.ts               # ★ DAG → lane(컬럼) 계산 (순수 함수, 테스트 대상)
│  │  ├ status.ts              # working tree 변경 파싱 (M/A/D/??/충돌 UU 등)
│  │  ├ diff.ts                # 커밋/파일 diff, working tree diff
│  │  ├ branch.ts              # 목록, checkout, 생성
│  │  ├ commit.ts              # stage(add) + commit, commit&push
│  │  ├ remote.ts              # fetch/pull/push, set-url, URL 호스트 별칭 재작성
│  │  └ ops.ts                 # merge / rebase / cherry-pick / continue / abort
│  ├ ssh/
│  │  └ config.ts              # ★ ~/.ssh/config 파싱 → Host 별칭 목록 (순수 함수, 테스트 대상)
│  ├ repos/
│  │  └ store.ts               # 최근 저장소 목록 (userData/recent-repos.json)
│  └ ipc/
│     └ index.ts               # 위 모듈들을 ipcMain.handle 로 노출
└ src/                         # 렌더러
   ├ main.tsx, App.tsx
   ├ store/                    # zustand
   │  ├ repoStore.ts           # 현재 repo, 최근 목록
   │  ├ logStore.ts            # 브랜치, 커밋, 선택 커밋, 변경파일, diff
   │  └ commitStore.ts         # working tree 변경, 체크상태, 메시지
   └ components/
      ├ TopBar.tsx             # repo 전환 + Fetch/Pull/Push + ⚙
      ├ BranchPanel.tsx        # 좌측 브랜치 트리 + 우클릭 메뉴
      ├ CommitGraph/           # 가운데 커밋 그래프 (SVG lane 렌더)
      ├ ChangedFiles.tsx       # 우측 변경 파일 목록
      ├ DiffView.tsx           # 하단 diff (통합/좌우 토글)
      ├ CommitView.tsx         # 커밋 창 (체크박스 + 메시지 + 버튼)
      ├ RemoteDialog.tsx       # 원격/SSH 계정 관리
      └ ConflictPanel.tsx      # 충돌 파일 목록 + 에디터 열기/해결/continue/abort
```

## 5. 데이터 흐름

렌더러 `window.api.git.X(...)` → preload `ipcRenderer.invoke` → `ipcMain.handle` → `git/` 모듈이
`execFile`로 git 실행 → stdout 파싱해 **JSON 반환** → zustand 스토어 갱신 → React 렌더.

메인 프로세스만 git·파일시스템에 접근하고, 렌더러는 IPC로만 통신한다(video-finder 패턴과 동일).

## 6. 핵심 구현 포인트

- **커밋 그래프 lane 계산** (`graph.ts`): `git log --all --parents` 로 각 커밋의 hash/부모/refs를
  받아, 부모-자식 관계로 커밋을 컬럼(lane)에 배치하고 노드·엣지 좌표를 산출한다. 결과를
  `CommitGraph` 컴포넌트가 SVG로 렌더한다. 순수 함수로 분리해 테스트한다.
- **SSH 계정 전환** (`ssh/config.ts` + `remote.ts`): `~/.ssh/config`의 `Host` 블록을 파싱해
  별칭/HostName/IdentityFile 목록을 만든다. 사용자가 계정을 고르면 현재 원격 URL의 호스트
  부분을 선택한 Host 별칭으로 치환해 `git remote set-url`을 실행한다.
- **최근 저장소** (`repos/store.ts`): `app.getPath('userData')/recent-repos.json`에 경로 목록 저장.

## 7. 에러 처리

- 모든 git 호출은 `exec.ts` 한 곳을 통과한다. 0이 아닌 종료코드면 stderr를 그대로 담아 throw하고,
  렌더러에서 토스트/에러 패널로 표시한다(조용히 삼키지 않는다).
- merge/rebase/cherry-pick 후 종료코드 + `status`의 `UU`/`AA`/`DU` 등으로 충돌을 판별해
  `ConflictPanel`을 자동 표시한다.
- push 실패(non-fast-forward 등) 메시지는 그대로 노출한다.

## 8. 테스트 (vitest)

순수 로직 위주로 회귀 위험이 큰 함수를 테스트한다. UI는 v1에서 단위테스트 제외(또는 최소).

- `graph.ts` — lane 계산 (분기/머지/병렬 브랜치 등 다양한 그래프 케이스)
- `ssh/config.ts` — Host/HostName/IdentityFile 파싱, 와일드카드·`Include` 처리
- `log.ts` / `status.ts` — porcelain 출력 파서
- `remote.ts` — URL 호스트 별칭 재작성 로직
