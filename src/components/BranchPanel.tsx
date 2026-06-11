import { useMemo, useState } from 'react'
import type { Branch } from '../types'

interface Props {
  branches: Branch[]
  onCheckout: (name: string) => void
}

export function BranchPanel({ branches, onCheckout }: Props) {
  const [filter, setFilter] = useState('')
  const { local, remote } = useMemo(() => {
    const f = branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    return {
      local: f.filter((b) => !b.isRemote),
      remote: f.filter((b) => b.isRemote),
    }
  }, [branches, filter])

  return (
    <div className="w-56 border-r flex flex-col text-xs">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="🔍 branch filter"
        className="m-2 px-2 py-1 border rounded"
      />
      <div className="overflow-auto flex-1">
        <Section title="Local" branches={local} onCheckout={onCheckout} />
        <Section title="Remote" branches={remote} onCheckout={onCheckout} />
      </div>
    </div>
  )
}

function Section({
  title,
  branches,
  onCheckout,
}: {
  title: string
  branches: Branch[]
  onCheckout: (name: string) => void
}) {
  return (
    <div className="px-2 py-1">
      <div className="text-gray-400 uppercase text-[10px] mb-1">{title}</div>
      {branches.map((b) => (
        <div
          key={b.name}
          onDoubleClick={() => !b.isRemote && onCheckout(b.name)}
          className={`px-2 py-0.5 rounded cursor-default flex items-center gap-1 hover:bg-gray-100 ${
            b.isCurrent ? 'font-semibold text-blue-700' : ''
          }`}
          title={b.isRemote ? b.name : 'double-click to checkout'}
        >
          <span>{b.isCurrent ? '●' : '○'}</span>
          <span className="truncate flex-1">{b.name}</span>
          {b.ahead ? <span className="text-green-600">↑{b.ahead}</span> : null}
          {b.behind ? <span className="text-red-600">↓{b.behind}</span> : null}
        </div>
      ))}
    </div>
  )
}
