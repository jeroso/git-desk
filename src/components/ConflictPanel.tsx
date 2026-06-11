import { useConflictStore } from '../store/conflictStore'
import { useToast, withToast } from '../lib/api'
import type { FileChange } from '../types'

export function ConflictPanel({ repo, onDone }: { repo: string; onDone: () => void }) {
  const { active, op, files, open, close } = useConflictStore()
  if (!active || !op) return null

  // 현재 충돌 파일 목록을 다시 읽어 패널에 반영한다. 남은 충돌이 없으면 0개로 갱신된다.
  const refreshConflicts = async (): Promise<string[]> => {
    const status: FileChange[] = (await withToast(() => window.api.git.status(repo))) ?? []
    const conflicted = status.filter((c) => c.status === 'conflicted').map((c) => c.path)
    open(op, conflicted)
    return conflicted
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl w-[32rem] p-4 text-xs space-y-3">
        <div className="font-semibold text-sm text-red-600">
          충돌 발생 — {op} 중 ({files.length} files)
        </div>
        {files.length === 0 && (
          <div className="text-gray-500">
            남은 충돌이 없습니다. "계속"을 눌러 {op}을(를) 마무리하세요.
          </div>
        )}
        <div className="border rounded divide-y max-h-60 overflow-auto">
          {files.map((f) => (
            <div key={f} className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 font-mono truncate">{f}</span>
              <button
                className="border rounded px-2 py-0.5 hover:bg-gray-100"
                onClick={() => window.api.shell.openPath(`${repo}/${f}`)}
              >
                에디터에서 열기
              </button>
              <button
                className="border rounded px-2 py-0.5 hover:bg-gray-100"
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
          <button
            onClick={async () => {
              await withToast(() => window.api.git.abortOp(repo, op))
              close()
              onDone()
            }}
            className="border rounded px-3 py-1"
          >
            중단 (abort)
          </button>
          <button
            onClick={async () => {
              const res = await withToast(() => window.api.git.continueOp(repo, op))
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
        </div>
      </div>
    </div>
  )
}
