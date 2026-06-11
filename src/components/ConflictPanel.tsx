import { useConflictStore } from '../store/conflictStore'
import { withToast } from '../lib/api'

export function ConflictPanel({ repo, onDone }: { repo: string; onDone: () => void }) {
  const { active, op, files, close } = useConflictStore()
  if (!active || !op) return null

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl w-[32rem] p-4 text-xs space-y-3">
        <div className="font-semibold text-sm text-red-600">
          충돌 발생 — {op} 중 ({files.length} files)
        </div>
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
                onClick={() => withToast(() => window.api.git.markResolved(repo, [f]))}
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
              if (res !== undefined) {
                close()
                onDone()
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
