import { useMemo, useState } from 'react'

interface FileEntry {
  path: string
  status: string
}

interface Props {
  files: FileEntry[]
  selectedFile: string | null
  onSelect: (file: string) => void
  /** Double-click / popout: open this file's diff in a separate window. */
  onOpenWindow: (file: string) => void
}

// IntelliJ-style colors for the whole filename:
//   A(added)=green, M(modified)=blue, D(deleted)=grey strikethrough, R(renamed)=cyan/teal.
const FILE_COLOR: Record<string, string> = {
  A: 'text-green-600 dark:text-green-400',
  M: 'text-blue-600 dark:text-blue-400',
  D: 'text-gray-400 line-through dark:text-neutral-500',
  R: 'text-teal-600 dark:text-teal-400',
}
// status letter badge uses the same hue (a touch stronger).
const STATUS_COLOR: Record<string, string> = {
  M: 'text-blue-600 dark:text-blue-400',
  A: 'text-green-600 dark:text-green-400',
  D: 'text-gray-400 dark:text-neutral-500',
  R: 'text-teal-600 dark:text-teal-400',
}

// A node in the file tree built by splitting paths on '/'.
// A leaf carries the actual file entry; a folder groups children.
interface TreeNode {
  segment: string
  fullPath: string
  file?: FileEntry
  children: Map<string, TreeNode>
}

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { segment: '', fullPath: '', children: new Map() }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    let acc = ''
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      let child = node.children.get(part)
      if (!child) {
        child = { segment: part, fullPath: acc, children: new Map() }
        node.children.set(part, child)
      }
      if (i === parts.length - 1) child.file = f
      node = child
    })
  }
  return root
}

// Collapse chains of single-child *directories* into one folder row
// (e.g. "src/main/java/kr/co/...") like IntelliJ — but never absorb the file
// itself, so leaves always render as a bare filename on their own row.
function collapseChain(node: TreeNode): TreeNode {
  let n = node
  while (!n.file && n.children.size === 1) {
    const only = [...n.children.values()][0]
    if (only.children.size === 0) break // single child is a file: keep it as a separate leaf row
    n = { ...only, segment: `${n.segment}/${only.segment}` }
  }
  return n
}

export function ChangedFiles({ files, selectedFile, onSelect, onOpenWindow }: Props) {
  const tree = useMemo(() => buildTree(files), [files])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes
      .map(collapseChain)
      .sort((a, b) => {
        // folders first, then files; alphabetical within each group
        const af = a.children.size > 0 && !a.file ? 0 : 1
        const bf = b.children.size > 0 && !b.file ? 0 : 1
        return af - bf || a.segment.localeCompare(b.segment)
      })
      .map((n) => {
        const kids = [...n.children.values()]
        if (kids.length === 0 && n.file) {
          const f = n.file
          const code = f.status[0]
          const isSelected = f.path === selectedFile
          return (
            <button
              key={f.path}
              onClick={() => onSelect(f.path)}
              onDoubleClick={() => onOpenWindow(f.path)}
              style={{ paddingLeft: depth * 12 + 8 }}
              title={`${f.path}\n(double-click: 새 창에서 보기)`}
              className={`w-full text-left pr-2 py-0.5 flex gap-2 items-center ${
                isSelected
                  ? 'bg-blue-100 dark:bg-blue-500/30'
                  : 'hover:bg-gray-100 dark:hover:bg-neutral-800'
              }`}
            >
              <span className={STATUS_COLOR[code] ?? 'text-gray-500'}>{code}</span>
              <span className={`truncate flex-1 ${FILE_COLOR[code] ?? 'text-gray-700 dark:text-neutral-200'}`}>
                {n.segment}
              </span>
            </button>
          )
        }
        const isCollapsed = collapsed.has(n.fullPath)
        return (
          <div key={n.fullPath}>
            <button
              onClick={() => toggle(n.fullPath)}
              style={{ paddingLeft: depth * 12 + 8 }}
              className="w-full text-left flex items-center gap-1 py-0.5 pr-2 text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800"
            >
              <span className="w-3 text-gray-400 dark:text-neutral-500">{isCollapsed ? '▸' : '▾'}</span>
              <span className="truncate">{n.segment}</span>
            </button>
            {!isCollapsed && renderNodes(kids, depth + 1)}
          </div>
        )
      })

  return (
    <div className="w-full h-full border-l dark:border-neutral-700 overflow-auto text-xs">
      <div className="text-gray-400 dark:text-neutral-500 uppercase text-[10px] px-2 py-1">
        Changed Files
      </div>
      {renderNodes([...tree.children.values()], 0)}
    </div>
  )
}
