interface Props {
  files: { path: string; status: string }[]
  selectedFile: string | null
  onSelect: (file: string) => void
}

const STATUS_COLOR: Record<string, string> = {
  M: 'text-amber-600',
  A: 'text-green-600',
  D: 'text-red-600',
  R: 'text-blue-600',
}

export function ChangedFiles({ files, selectedFile, onSelect }: Props) {
  return (
    <div className="w-72 border-l overflow-auto text-xs">
      <div className="text-gray-400 uppercase text-[10px] px-2 py-1">Changed Files</div>
      {files.map((f) => {
        const code = f.status[0]
        return (
          <button
            key={f.path}
            onClick={() => onSelect(f.path)}
            className={`w-full text-left px-2 py-0.5 flex gap-2 ${
              f.path === selectedFile ? 'bg-blue-100' : 'hover:bg-gray-100'
            }`}
          >
            <span className={STATUS_COLOR[code] ?? 'text-gray-500'}>{code}</span>
            <span className="truncate flex-1">{f.path}</span>
          </button>
        )
      })}
    </div>
  )
}
