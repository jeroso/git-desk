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
          <button onClick={onCancel} className="border dark:border-neutral-600 rounded px-3 py-1 hover:bg-gray-100 dark:hover:bg-neutral-700">
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
