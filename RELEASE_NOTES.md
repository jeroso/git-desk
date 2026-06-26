## 🔧 v0.4.2 — 충돌 / 로그 UX 개선

### 변경
- **여러 커밋 선택 시 Changed Files 표시** — 커밋을 여러 개(Shift / ⌘+클릭) 선택하면 그 범위에서 바뀐 **모든 파일**이 목록에 나오고, 파일을 클릭하면 범위 전체의 변경 내용을 보여줍니다. (이전엔 활성 커밋 하나만 표시)
- **3-pane 머지 라벨 영어화** — 헷갈리던 `내 것 / 그쪽` 대신 git 표준 용어 **Local · Result · Remote**, 버튼은 **Use Local / Both / Use Remote** 로 명확하게 바꿨습니다. (Local = 현재 브랜치, Remote = 들어오는 쪽)
- **Esc 로 닫기** — 충돌 팝업과 3-pane 머지 화면을 **Esc** 키로 닫을 수 있습니다. 충돌 상태는 상단 "충돌 해결 중" 배너로 계속 표시되니 안심하고 닫아도 됩니다.

### ⬇️ 다운로드
- **macOS (Intel + Apple Silicon 통합)**: `git-desk-0.4.2-universal.dmg`
