interface Props {
  branch: string
  onSmart: () => void
  onForce: () => void
  onCancel: () => void
}

/**
 * 일반 체크아웃이 커밋되지 않은 로컬 변경 때문에 거부됐을 때 띄우는 선택 다이얼로그.
 * - 스마트: `git checkout -m`으로 로컬 변경을 대상 브랜치에 머지(충돌 시 해결 패널).
 * - 강제: 로컬 변경을 버리고 전환.
 */
export function CheckoutConflictDialog({ branch, onSmart, onForce, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
      <div className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-[30rem] p-4 text-xs space-y-3">
        <div className="font-semibold text-sm">'{branch}'로 체크아웃 — 로컬 변경 충돌</div>
        <div className="text-gray-600 dark:text-neutral-300 leading-relaxed">
          커밋되지 않은 로컬 변경이 있어 그대로 전환할 수 없습니다. 어떻게 할까요?
        </div>
        <ul className="text-gray-500 dark:text-neutral-400 space-y-1 list-disc pl-4">
          <li>
            <b>스마트 체크아웃</b>: 로컬 변경을 대상 브랜치로 머지합니다(충돌나면 해결 패널이
            열립니다).
          </li>
          <li>
            <b>강제 체크아웃</b>: 로컬 변경을 <span className="text-red-600">버리고</span>{' '}
            전환합니다.
          </li>
        </ul>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="border dark:border-neutral-600 rounded px-3 py-1 hover:bg-gray-100 dark:hover:bg-neutral-700"
          >
            취소
          </button>
          <button
            onClick={onForce}
            className="border border-red-500 text-red-600 rounded px-3 py-1 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            강제 체크아웃
          </button>
          <button
            onClick={onSmart}
            className="bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700"
          >
            스마트 체크아웃
          </button>
        </div>
      </div>
    </div>
  )
}
