# git-desk

IntelliJ 스타일의 데스크톱 Git 클라이언트. Electron + React + Zustand + Tailwind 로 만든 가벼운 GUI 입니다.

## 주요 기능

- **커밋 그래프 / 로그** — 브랜치별 히스토리 보기, 커밋 다중 선택 후 cherry-pick
- **브랜치 관리** — `/` 기준 폴더 트리, 우클릭 컨텍스트 메뉴
  - Checkout · New branch from… · Merge · Rebase
  - **Update**(pull / fast-forward fetch) · **Push** · **Delete**(로컬 `-d`/`-D`, 원격 `--delete`)
  - 원격 브랜치 체크아웃 시 추적(local tracking) 브랜치 자동 생성
- **변경 파일 보기** — IntelliJ식 폴더 트리 + 상태 색상(추가=초록, 수정=파랑, 삭제=회색, 이름변경=청록)
  - 파일 더블클릭 시 **별도 창**에서 diff 보기
  - diff 의 git 헤더 노이즈(`diff --git`/`index`/`---`/`+++`) 제거해 깔끔하게 표시
- **커밋 탭** — 현재 브랜치 표시, 파일 선택 커밋 / Commit & Push, **Rollback**(변경 되돌리기)
- **충돌 해결 패널**, **원격(remote) 별칭/SSH 호스트 설정**
- **라이트 / 다크 테마**, 드래그로 패널 크기 조절

## 개발

```bash
npm install
npm run dev        # Electron + Vite 개발 모드
npm run typecheck  # 타입 체크
npm test           # 단위 테스트 (vitest)
```

> 개발 모드에서 DevTools는 자동으로 열리지 않습니다. `⌥⌘I`로 토글하거나 `OPEN_DEVTOOLS=1 npm run dev` 로 실행하세요.

## 빌드 (로컬)

```bash
npm run build                                          # 렌더러 + electron 번들
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --universal --publish never
# → release/git-desk-<version>-universal.dmg
```

## 릴리스 (GitHub Actions)

`v*` 태그를 푸시하면 `.github/workflows/build.yml` 이 macOS universal `.dmg`(Intel + Apple Silicon)를 빌드해 GitHub Release 에 자동 첨부합니다.

```bash
# main 에 변경을 머지한 뒤
npm version patch                    # 예: 0.1.0 → 0.1.1 (커밋 + 태그 생성)
git push origin main --follow-tags   # 태그가 푸시되면 릴리스 워크플로 시작
```

수동 실행(Actions → **Build & Release** → Run workflow)은 릴리스를 만들지 않고 `.dmg`를 빌드 아티팩트로 올립니다.

## 설치 (macOS) — "손상되었다 / 확인되지 않은 개발자" 경고 해결

배포되는 `.dmg`는 **Apple 코드 서명·공증이 안 된** 빌드라, 다운로드해서 설치하면 macOS Gatekeeper 가 격리(quarantine) 속성을 붙여 실행을 막습니다. 앱을 `/Applications` 로 옮긴 뒤 아래 명령으로 격리 속성을 제거하면 정상 실행됩니다.

```bash
xattr -dr com.apple.quarantine "/Applications/git-desk.app"
```

> 앱 이름(`git-desk`)이 다르거나 다른 위치에 설치했다면 경로를 그에 맞게 바꿔주세요.

## 라이선스

Private project.
