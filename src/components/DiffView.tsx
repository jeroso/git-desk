import { cleanDiff } from '../lib/diff'

interface Props {
  file: string | null
  diff: string
}

function lineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300'
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300'
  if (line.startsWith('@@')) return 'text-blue-600'
  return 'text-gray-700 dark:text-neutral-200'
}

export function DiffView({ file, diff }: Props) {
  return (
    <div className="h-full border-t dark:border-neutral-700 flex flex-col">
      <div className="text-gray-500 dark:text-neutral-400 text-xs px-2 py-1 border-b dark:border-neutral-700 flex justify-between">
        <span>DIFF {file ? `— ${file}` : ''}</span>
        <span className="text-gray-300 dark:text-neutral-500">통합 ⇄ 좌우 (v2)</span>
      </div>
      <pre className="flex-1 overflow-auto text-xs font-mono leading-tight">
        {cleanDiff(diff).split('\n').map((line, i) => (
          <div key={i} className={`px-2 ${lineClass(line)}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
