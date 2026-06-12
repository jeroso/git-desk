interface Props {
  file: string | null
  diff: string
}

function lineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-green-50 text-green-800'
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-red-50 text-red-800'
  if (line.startsWith('@@')) return 'text-blue-600'
  return 'text-gray-700'
}

export function DiffView({ file, diff }: Props) {
  return (
    <div className="h-full border-t flex flex-col">
      <div className="text-gray-500 text-xs px-2 py-1 border-b flex justify-between">
        <span>DIFF {file ? `— ${file}` : ''}</span>
        <span className="text-gray-300">통합 ⇄ 좌우 (v2)</span>
      </div>
      <pre className="flex-1 overflow-auto text-xs font-mono leading-tight">
        {diff.split('\n').map((line, i) => (
          <div key={i} className={`px-2 ${lineClass(line)}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
