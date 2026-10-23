## 🐛 v0.5.6 — 커밋하지 않은 변경이 있으면 Rebase가 막히던 문제 수정

작업 브랜치에서 파일을 고치던 중에 `develop` 같은 기준 브랜치가 앞서 나가서 Rebase 하면, 충돌이 없는데도 영문 에러로 막히던 문제를 고쳤습니다.

### 🐛 버그 수정
- **브랜치 우클릭 "Rebase"가 `cannot rebase: You have unstaged changes.` 로 거부되던 문제** — git은 충돌 여부와 상관없이, 추적 중인 파일에 커밋하지 않은 수정이 하나라도 있으면 rebase를 시작하지 않습니다. IntelliJ는 이때 로컬 변경을 잠시 보관했다가 끝나면 되돌려 주기 때문에 같은 상황에서도 문제없이 진행됩니다.
  - 이제 git-desk도 **로컬 변경을 잠시 보관(stash)했다가, Rebase가 끝나면 다시 적용**합니다(`rebase --autostash`). 고치던 파일은 그대로 남습니다.
  - **"Merge"도 같은 방식**으로 바꿨습니다(`merge --autostash`). 지금까지는 합칠 커밋이 고치던 파일을 건드리면 `Your local changes ... would be overwritten by merge` 로 거부되었습니다.
- **다시 적용하다 충돌한 경우** — 새 커밋이 고치던 파일과 같은 곳을 바꿨다면, Rebase/Merge는 끝나고 그 파일에만 충돌 표시가 남습니다. 이때 **"로컬 변경 되돌리기 충돌"** 창이 열립니다. 파일을 정리한 뒤 "완료"를 누르면 됩니다(계속/중단은 없습니다).

### ℹ️ 알아두기
- 다시 적용하다 충돌하면 원래 변경은 stash 목록에 **`autostash`라는 이름으로 남습니다.** 충돌을 정리한 뒤 필요 없으면 지워도 됩니다(`git stash drop`).
- 새로 만들고 아직 git에 추가하지 않은 파일(untracked)은 원래도 Rebase를 막지 않으므로 보관하지 않고 그대로 둡니다.

### ⬇️ 다운로드
- **macOS (Intel + Apple Silicon 통합)**: `git-desk-0.5.6-universal.dmg`
