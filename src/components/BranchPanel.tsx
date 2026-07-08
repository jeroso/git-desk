import { useEffect, useMemo, useState } from 'react'
import type { Branch } from '../types'
import { BranchContextMenu } from './BranchContextMenu'
import { rangeBetween } from '../lib/select'

interface Props {
  branches: Branch[]
  selectedRef: string | null
  onSelectBranch: (ref: string | null) => void
  onCheckout: (name: string, isRemote: boolean) => void
  onNewBranch: (base: string) => void
  onMerge: (name: string) => void
  onRebase: (name: string) => void
  onUpdate: (name: string) => void
  onPush: (name: string) => void
  onDelete: (name: string, isRemote: boolean) => void
  onBulkDelete: (names: string[]) => void
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

export function BranchPanel({
  branches,
  selectedRef,
  onSelectBranch,
  onCheckout,
  onNewBranch,
  onMerge,
  onRebase,
  onUpdate,
  onPush,
  onDelete,
  onBulkDelete,
  onCreate,
}: Props) {
  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; b: Branch } | null>(null)
  // 일괄 작업용 다중 선택(브랜치 표시 이름 집합)과 Shift 범위의 기준점(anchor).
  // 히스토리 필터(selectedRef)와는 별개다: 일반 클릭만 히스토리를 바꾼다.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)

  const { local, remote } = useMemo(() => {
    const f = branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    return {
      local: f.filter((b) => !b.isRemote),
      remote: f.filter((b) => b.isRemote),
    }
  }, [branches, filter])

  // 삭제 등으로 사라진 브랜치는 선택에서 자동 제거해 유령 선택을 막는다.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const names = new Set(branches.map((b) => b.name))
      const next = new Set([...prev].filter((n) => names.has(n)))
      return next.size === prev.size ? prev : next
    })
  }, [branches])

  // 행 클릭: ⌘/Ctrl=토글, Shift=범위(같은 섹션 내), 일반=단일 선택 + 히스토리 보기.
  const onRowClick = (b: Branch, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(b.name)) next.delete(b.name)
        else next.add(b.name)
        return next
      })
      setAnchor(b.name)
    } else if (e.shiftKey) {
      const names = (b.isRemote ? remote : local).map((x) => x.name)
      setSelected(new Set(rangeBetween(names, anchor, b.name)))
      // anchor는 유지해 연속 Shift로 범위를 늘였다 줄일 수 있게 한다.
    } else {
      setSelected(new Set([b.name]))
      setAnchor(b.name)
      onSelectBranch(b.name)
    }
  }

  const clearSelection = () => {
    setSelected(new Set())
    setAnchor(null)
  }

  const openMenu = (e: React.MouseEvent, b: Branch) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, b })
  }

  // 우클릭한 브랜치가 2개 이상 다중 선택의 일부일 때만 "일괄 삭제" 모드.
  const bulkCount = (b: Branch) => (selected.size > 1 && selected.has(b.name) ? selected.size : undefined)

  const sectionProps = { selected, onRowClick, onContextMenu: openMenu }

  return (
    <div className="w-full h-full border-r dark:border-neutral-700 flex flex-col text-xs">
      <div className="flex gap-1 m-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 branch filter"
          className="flex-1 px-2 py-1 border rounded min-w-0 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-200"
        />
        <button onClick={onCreate} className="border dark:border-neutral-600 rounded px-2 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200" title="새 브랜치">
          +
        </button>
      </div>
      {selected.size > 1 && (
        <div className="mx-2 mb-1 px-2 py-1 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <span>{selected.size}개 선택됨 · 우클릭 → 삭제</span>
          <button onClick={clearSelection} className="hover:underline" title="선택 해제">
            해제
          </button>
        </div>
      )}
      <div className="overflow-auto flex-1">
        <button
          onClick={() => {
            clearSelection()
            onSelectBranch(null)
          }}
          className={`w-full text-left px-2 py-0.5 flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-neutral-800 ${
            selectedRef === null ? 'bg-blue-100 dark:bg-blue-500/30 font-semibold' : ''
          }`}
        >
          <span className="w-3 text-center">✱</span>
          <span>All branches</span>
        </button>
        <Section title="Local" branches={local} expandAll={filter.length > 0} {...sectionProps} />
        <Section title="Remote" branches={remote} expandAll={filter.length > 0} {...sectionProps} />
      </div>
      {menu && (
        <BranchContextMenu
          x={menu.x}
          y={menu.y}
          branch={menu.b.name}
          isCurrent={menu.b.isCurrent}
          isRemote={menu.b.isRemote}
          bulkCount={bulkCount(menu.b)}
          onClose={() => setMenu(null)}
          onAction={(a) => {
            if (a === 'delete' && bulkCount(menu.b)) onBulkDelete([...selected])
            else if (a === 'checkout') onCheckout(menu.b.name, menu.b.isRemote)
            else if (a === 'newBranch') onNewBranch(menu.b.name)
            else if (a === 'merge') onMerge(menu.b.name)
            else if (a === 'rebase') onRebase(menu.b.name)
            else if (a === 'update') onUpdate(menu.b.name)
            else if (a === 'push') onPush(menu.b.name)
            else if (a === 'delete') onDelete(menu.b.name, menu.b.isRemote)
          }}
        />
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  branches: Branch[]
  expandAll: boolean
  selected: Set<string>
  onRowClick: (b: Branch, e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, b: Branch) => void
}

function Section({ title, branches, expandAll, ...rowProps }: SectionProps) {
  // Expanded folder paths. Default: 모든 폴더 접힘. 사용자가 펼친 폴더만 여기에 담긴다.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const tree = useMemo(() => buildTree(branches), [branches])

  // 현재 체크아웃된 브랜치의 조상 폴더 경로들. 예: 현재가 "feat/ITS-4576"이면 {"feat"}.
  // 마지막 세그먼트(브랜치 자신)는 폴더가 아니므로 제외한다.
  const currentAncestors = useMemo(() => {
    const cur = branches.find((b) => b.isCurrent)
    const set = new Set<string>()
    if (cur) {
      const parts = cur.name.split('/')
      let acc = ''
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i]
        set.add(acc)
      }
    }
    return set
  }, [branches])

  // 현재 브랜치가 바뀌면 그 경로의 폴더들을 자동으로 펼친다(HEAD를 클릭 없이 보이게).
  // 사용자가 직접 접은 다른 폴더는 그대로 두고, 현재 브랜치 조상만 합친다.
  const currentKey = [...currentAncestors].join('|')
  useEffect(() => {
    if (currentAncestors.size === 0) return
    setExpanded((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const p of currentAncestors) if (!next.has(p)) (next.add(p), (changed = true))
      return changed ? next : prev
    })
    // currentAncestors는 매 렌더 새 Set이라 문자열 키로 안정화해 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey])

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      const kids = [...n.children.values()]
      if (kids.length === 0) {
        return <BranchRow key={n.fullName} branch={n.branch!} label={n.segment} depth={depth} {...rowProps} />
      }
      const isCollapsed = !expandAll && !expanded.has(n.fullName)
      return (
        <div key={n.fullName}>
          <button
            onClick={() => toggle(n.fullName)}
            style={{ paddingLeft: depth * 12 + 8 }}
            className="w-full text-left flex items-center gap-1 py-0.5 pr-2 font-semibold text-gray-700 dark:text-neutral-100 hover:bg-gray-100 dark:hover:bg-neutral-800"
          >
            <span className="w-3 text-gray-400 dark:text-neutral-500 shrink-0">
              {isCollapsed ? '▸' : '▾'}
            </span>
            <span className="w-4 text-center shrink-0">{isCollapsed ? '📁' : '📂'}</span>
            <span className="truncate">{n.segment}</span>
          </button>
          {!isCollapsed && (
            <>
              {n.branch && (
                <BranchRow branch={n.branch} label={n.segment} depth={depth + 1} {...rowProps} />
              )}
              {renderNodes(kids, depth + 1)}
            </>
          )}
        </div>
      )
    })

  return (
    <div className="py-1">
      <div className="text-gray-400 dark:text-neutral-500 uppercase text-[10px] mb-1 px-2">{title}</div>
      {renderNodes([...tree.children.values()], 0)}
    </div>
  )
}

function BranchRow({
  branch: b,
  label,
  depth,
  selected,
  onRowClick,
  onContextMenu,
}: {
  branch: Branch
  label: string
  depth: number
  selected: Set<string>
  onRowClick: (b: Branch, e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, b: Branch) => void
}) {
  const isSelected = selected.has(b.name)
  return (
    <div
      onClick={(e) => onRowClick(b, e)}
      onContextMenu={(e) => onContextMenu(e, b)}
      style={{ paddingLeft: depth * 12 + 8 }}
      className={`pr-2 py-0.5 rounded cursor-default flex items-center gap-1 select-none hover:bg-gray-100 dark:hover:bg-neutral-800 ${
        isSelected ? 'bg-blue-100 dark:bg-blue-500/30' : ''
      } ${b.isCurrent ? 'font-semibold text-blue-700' : ''}`}
      title={
        b.isRemote
          ? `${b.name}\nclick: 히스토리 보기 · ⌘/Shift+click: 다중 선택 · 우클릭 → Checkout/삭제`
          : 'click: 히스토리 보기 · ⌘/Shift+click: 다중 선택 · 우클릭 → Checkout/삭제'
      }
    >
      <span className="w-3 text-center">{b.isCurrent ? '●' : '○'}</span>
      <span className="truncate flex-1">{label}</span>
      {b.ahead ? <span className="text-green-600">↑{b.ahead}</span> : null}
      {b.behind ? <span className="text-red-600">↓{b.behind}</span> : null}
    </div>
  )
}
