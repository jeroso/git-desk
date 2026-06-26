import { useState } from 'react'

export function MessageDialog({
  title,
  initial,
  onCancel,
  onConfirm,
}: {
  title: string
  initial: string
  onCancel: () => void
  onConfirm: (msg: string) => void
}) {
  const [msg, setMsg] = useState(initial)
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-[32rem] p-4 text-xs space-y-3">
        <div className="font-semibold text-sm">{title}</div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={6}
          autoFocus
          className="w-full border dark:border-neutral-600 dark:bg-neutral-900 rounded p-2 font-mono"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="border dark:border-neutral-600 rounded px-3 py-1">
            취소
          </button>
          <button
            onClick={() => onConfirm(msg)}
            disabled={msg.trim().length === 0}
            className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
