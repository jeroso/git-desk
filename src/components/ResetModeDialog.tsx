import { useState } from 'react'

type Mode = 'soft' | 'mixed' | 'hard'

export function ResetModeDialog({
  shortHash,
  onCancel,
  onConfirm,
}: {
  shortHash: string
  onCancel: () => void
  onConfirm: (mode: Mode) => void
}) {
  const [mode, setMode] = useState<Mode>('mixed')
  const opts: { v: Mode; label: string; desc: string }[] = [
    { v: 'soft', label: 'Soft', desc: '커밋만 취소. 변경분은 staged 상태로 보존됩니다.' },
    { v: 'mixed', label: 'Mixed', desc: '커밋 취소 후 unstage. 변경분은 작업트리에 남습니다.' },
    { v: 'hard', label: 'Hard', desc: '커밋과 변경분을 모두 폐기합니다. 되돌릴 수 없습니다.' },
  ]
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-96 p-4 text-xs space-y-3">
        <div className="font-semibold text-sm">현재 브랜치를 {shortHash}(으)로 Reset</div>
        <div className="space-y-2">
          {opts.map((o) => (
            <label key={o.v} className="flex gap-2 items-start cursor-pointer">
              <input
                type="radio"
                name="reset-mode"
                checked={mode === o.v}
                onChange={() => setMode(o.v)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-gray-500 dark:text-neutral-400">{o.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="border dark:border-neutral-600 rounded px-3 py-1">
            취소
          </button>
          <button onClick={() => onConfirm(mode)} className="bg-blue-600 text-white rounded px-3 py-1">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
