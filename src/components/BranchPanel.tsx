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

// A node in the branch tree built by splitting names on '/'.
// A leaf (no children) carries the actual Branch; a folder groups children.
interface TreeNode {
  segment: string
  fullName: string
  branch?: Branch
  children: Map<string, TreeNode>
}

function buildTree(branches: Branch[]): TreeNode {
  const root: TreeNode = { segment: '', fullName: '', children: new Map() }
  for (const b of branches) {
    const parts = b.name.split('/')
    let node = root
    let acc = ''
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      let child = node.children.get(part)
      if (!child) {
        child = { segment: part, fullName: acc, children: new Map() }
        node.children.set(part, child)
      }
      if (i === parts.length - 1) child.branch = b
      node = child
    })
  }
  return root
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
        <Section
          title="Local"
          branches={local}
          expandAll={filter.length > 0}
          onCheckout={onCheckout}
          onContextMenu={openMenu}
        />
        <Section
          title="Remote"
          branches={remote}
          expandAll={filter.length > 0}
          onCheckout={onCheckout}
          onContextMenu={openMenu}
        />
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
  expandAll,
  onCheckout,
  onContextMenu,
}: {
  title: string
  branches: Branch[]
  expandAll: boolean
  onCheckout: (name: string) => void
  onContextMenu: (e: React.MouseEvent, b: Branch) => void
}) {
  // Collapsed folder paths (default: everything expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const tree = useMemo(() => buildTree(branches), [branches])

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      const kids = [...n.children.values()]
      if (kids.length === 0) {
        return (
          <BranchRow
            key={n.fullName}
            branch={n.branch!}
            label={n.segment}
            depth={depth}
            onCheckout={onCheckout}
            onContextMenu={onContextMenu}
          />
        )
      }
      const isCollapsed = !expandAll && collapsed.has(n.fullName)
      return (
        <div key={n.fullName}>
          <button
            onClick={() => toggle(n.fullName)}
            style={{ paddingLeft: depth * 12 + 8 }}
            className="w-full text-left flex items-center gap-1 py-0.5 pr-2 text-gray-600 hover:bg-gray-100"
          >
            <span className="w-3 text-gray-400">{isCollapsed ? '▸' : '▾'}</span>
            <span className="truncate">{n.segment}</span>
          </button>
          {!isCollapsed && (
            <>
              {/* a branch that also acts as a folder prefix (rare) shows as a leaf inside */}
              {n.branch && (
                <BranchRow
                  branch={n.branch}
                  label={n.segment}
                  depth={depth + 1}
                  onCheckout={onCheckout}
                  onContextMenu={onContextMenu}
                />
              )}
              {renderNodes(kids, depth + 1)}
            </>
          )}
        </div>
      )
    })

  return (
    <div className="py-1">
      <div className="text-gray-400 uppercase text-[10px] mb-1 px-2">{title}</div>
      {renderNodes([...tree.children.values()], 0)}
    </div>
  )
}

function BranchRow({
  branch: b,
  label,
  depth,
  onCheckout,
  onContextMenu,
}: {
  branch: Branch
  label: string
  depth: number
  onCheckout: (name: string) => void
  onContextMenu: (e: React.MouseEvent, b: Branch) => void
}) {
  return (
    <div
      onDoubleClick={() => !b.isRemote && onCheckout(b.name)}
      onContextMenu={(e) => onContextMenu(e, b)}
      style={{ paddingLeft: depth * 12 + 8 }}
      className={`pr-2 py-0.5 rounded cursor-default flex items-center gap-1 hover:bg-gray-100 ${
        b.isCurrent ? 'font-semibold text-blue-700' : ''
      }`}
      title={b.isRemote ? b.name : 'double-click to checkout'}
    >
      <span className="w-3 text-center">{b.isCurrent ? '●' : '○'}</span>
      <span className="truncate flex-1">{label}</span>
      {b.ahead ? <span className="text-green-600">↑{b.ahead}</span> : null}
      {b.behind ? <span className="text-red-600">↓{b.behind}</span> : null}
    </div>
  )
}
