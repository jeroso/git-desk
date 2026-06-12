import { useEffect, useRef, useState } from 'react'
import { usePrompt } from '../lib/prompt'

export function PromptDialog() {
  const { open, message, defaultValue, submit, cancel } = usePrompt()
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      // focus + select on next tick so the input is mounted
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [open, defaultValue])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={cancel}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
        className="bg-white dark:bg-neutral-800 dark:text-neutral-100 rounded-lg shadow-xl w-80 p-4 text-xs space-y-3"
      >
        <div className="font-medium">{message}</div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel()
          }}
          className="w-full px-2 py-1 border rounded dark:bg-neutral-900 dark:border-neutral-600"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="border rounded px-3 py-1 dark:border-neutral-600"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40"
          >
            확인
          </button>
        </div>
      </form>
    </div>
  )
}
