import { useEffect } from 'react'
import { useToast } from '../lib/api'

export function Toast() {
  const { message, kind, clear } = useToast()

  // Auto-dismiss success/info toasts; keep errors until dismissed.
  useEffect(() => {
    if (message && kind === 'info') {
      const t = setTimeout(clear, 3000)
      return () => clearTimeout(t)
    }
  }, [message, kind, clear])

  if (!message) return null
  const color = kind === 'error' ? 'bg-red-600' : 'bg-emerald-600'
  return (
    <div
      className={`fixed bottom-4 right-4 max-w-md ${color} text-white text-xs rounded px-3 py-2 shadow-lg z-[60]`}
    >
      <div className="flex items-start gap-2">
        <pre className="whitespace-pre-wrap flex-1 max-h-40 overflow-auto">{message}</pre>
        <button onClick={clear} className="opacity-80 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  )
}
