import { useToast } from '../lib/api'

export function Toast() {
  const { message, clear } = useToast()
  if (!message) return null
  return (
    <div className="fixed bottom-4 right-4 max-w-md bg-red-600 text-white text-xs rounded px-3 py-2 shadow-lg z-50">
      <div className="flex items-start gap-2">
        <pre className="whitespace-pre-wrap flex-1">{message}</pre>
        <button onClick={clear} className="opacity-80 hover:opacity-100">✕</button>
      </div>
    </div>
  )
}
