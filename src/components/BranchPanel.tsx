import { useMemo, useState } from 'react'
import type { Branch } from '../types'
import { BranchContextMenu } from './BranchContextMenu'

interface Props {
  branches: Branch[]
  onCheckout: (name: string) => void
  onMerge: (name: string) => void
  onRebase: (name: string) => void
  onCreate: () => void
}

export function BranchPanel({ branches, onCheckout, onMerge, onRebase, onCreate }: Props) {
  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; b: Branch } | null>(null)

  const { local, remote } = useMemo(() => {
    const f = branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    return {
      local: f.filter((b) => !b.isRemote),
      remote: f.filter((b) => b.isRemote),
    }
  }, [branches, filter])

  const openMenu = (e: React.MouseEvent, b: Branch) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, b })
  }

  return (
    <div className="w-56 border-r flex flex-col text-xs">
      <div className="flex gap-1 m-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 branch filter"
          className="flex-1 px-2 py-1 border rounded min-w-0"
        />
        <button onClick={onCreate} className="border rounded px-2 hover:bg-gray-100" title="새 브랜치">
          +
        </button>
      </div>
      <div className="overflow-auto flex-1">
        <Section title="Local" branches={local} onCheckout={onCheckout} onContextMenu={openMenu} />
        <Section title="Remote" branches={remote} onCheckout={onCheckout} onContextMenu={openMenu} />
      </div>
      {menu && (
        <BranchContextMenu
          x={menu.x}
          y={menu.y}
          branch={menu.b.name}
          isCurrent={menu.b.isCurrent}
          onClose={() => setMenu(null)}
          onAction={(a) => {
            if (a === 'checkout') onCheckout(menu.b.name)
            else if (a === 'merge') onMerge(menu.b.name)
            else if (a === 'rebase') onRebase(menu.b.name)
          }}
        />
      )}
    </div>
  )
}

function Section({
  title,
  branches,
  onCheckout,
  onContextMenu,
}: {
  title: string
  branches: Branch[]
  onCheckout: (name: string) => void
  onContextMenu: (e: React.MouseEvent, b: Branch) => void
}) {
  return (
    <div className="px-2 py-1">
      <div className="text-gray-400 uppercase text-[10px] mb-1">{title}</div>
      {branches.map((b) => (
        <div
          key={b.name}
          onDoubleClick={() => !b.isRemote && onCheckout(b.name)}
          onContextMenu={(e) => onContextMenu(e, b)}
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
