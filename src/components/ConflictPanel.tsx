import { useEffect } from 'react'
import { useConflictStore } from '../store/conflictStore'
import { useToast, withToast } from '../lib/api'
import type { FileChange } from '../types'

export function ConflictPanel({ repo, onDone }: { repo: string; onDone: () => void }) {
  const { active, op, files, open, close, openMerge } = useConflictStore()

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useConflictStore.getState().mergeFile) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close])

  if (!active || !op) return null

  // 현재 충돌 파일 목록을 다시 읽어 패널에 반영한다. 남은 충돌이 없으면 0개로 갱신된다.
  const refreshConflicts = async (): Promise<string[]> => {
    const status: FileChange[] = (await withToast(() => window.api.git.status(repo))) ?? []
    const conflicted = status.filter((c) => c.status === 'conflicted').map((c) => c.path)
    open(op, conflicted)
    return conflicted
  }

  // checkout 모드: `git checkout -m`이 남긴 충돌. continue/commit 개념이 없고,
  // 사용자가 파일을 해결한 뒤 닫으면 변경은 작업트리에 그대로 남는다.
  const isCheckout = op === 'checkout'
  // checkout을 제외한 충돌 op(merge/rebase/cherry-pick/revert)에서 abort/continue에 사용.
  const resumeOp = op as 'merge' | 'rebase' | 'cherry-pick' | 'revert'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
      <div className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-[32rem] p-4 text-xs space-y-3">
        <div className="font-semibold text-sm text-red-600">
          {isCheckout ? '체크아웃 머지 충돌' : `충돌 발생 — ${op} 중`} ({files.length} files)
        </div>
        {files.length === 0 && (
          <div className="text-gray-500 dark:text-neutral-400">
            {isCheckout
              ? '남은 충돌이 없습니다. "완료"를 눌러 닫으세요. (변경은 작업트리에 유지됩니다)'
              : `남은 충돌이 없습니다. "계속"을 눌러 ${op}을(를) 마무리하세요.`}
          </div>
        )}
        <div className="border dark:border-neutral-700 rounded divide-y dark:divide-neutral-700 max-h-60 overflow-auto">
          {files.map((f) => (
            <div key={f} className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 font-mono truncate">{f}</span>
              <button
                className="border dark:border-neutral-600 rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700"
                onClick={() => openMerge(f)}
              >
                머지
              </button>
              <button
                className="border dark:border-neutral-600 rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700"
                onClick={() => window.api.shell.openPath(`${repo}/${f}`)}
              >
                에디터에서 열기
              </button>
              <button
                className="border dark:border-neutral-600 rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700"
                onClick={async () => {
                  await withToast(() => window.api.git.markResolved(repo, [f]))
                  await refreshConflicts()
                }}
              >
                해결됨 표시
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          {isCheckout ? (
            <button
              onClick={() => {
                close()
                onDone()
              }}
              className="bg-blue-600 text-white rounded px-3 py-1"
            >
              완료
            </button>
          ) : (
            <>
              <button
                onClick={async () => {
                  await withToast(() => window.api.git.abortOp(repo, resumeOp))
                  close()
                  onDone()
                }}
                className="border dark:border-neutral-600 rounded px-3 py-1"
              >
                중단 (abort)
              </button>
              <button
                onClick={async () => {
                  const res = await withToast(() => window.api.git.continueOp(repo, resumeOp))
                  if (!res) return // withToast가 에러를 잡은 경우(드묾)
                  if (res.ok) {
                    close()
                    onDone()
                  } else {
                    // continue 실패 — 충돌이 남아있음. 출력 노출 + 목록 갱신, 패널 유지.
                    useToast.getState().show(res.output)
                    await refreshConflicts()
                  }
                }}
                className="bg-blue-600 text-white rounded px-3 py-1"
              >
                계속 (continue)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
