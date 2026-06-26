import { useConflictStore } from '../store/conflictStore'

interface Props {
  onResolve: () => void
  onAbort: () => void
}

export function ConflictBanner({ onResolve, onAbort }: Props) {
  const detected = useConflictStore((s) => s.detected)
  if (!detected.inProgress) return null
  const abortable = detected.op !== null
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100">
      <span className="font-semibold">⚠️ 충돌 해결 중 ({detected.op ?? '충돌'})</span>
      <span className="text-amber-700 dark:text-amber-300">{detected.files.length}개 파일</span>
      <span className="flex-1" />
      <button onClick={onResolve} className="bg-amber-600 text-white rounded px-2 py-0.5 hover:bg-amber-700">
        해결하기
      </button>
      {abortable && (
        <button
          onClick={onAbort}
          className="border border-amber-400 dark:border-amber-600 rounded px-2 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-800"
        >
          중단 (abort)
        </button>
      )}
    </div>
  )
}
