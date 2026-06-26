import { useEffect, useState } from 'react'
import type { Commit, GraphLayout } from '../../types'
import { ROW_H, NODE_R, cx, cy, laneColor, graphWidth } from './render'
import { CommitContextMenu, type CommitAction } from '../CommitContextMenu'
import {
  isOnCurrentBranch,
  isContiguousFromHead,
  isContiguousRange,
  orderedOldestToNewest,
} from '../../lib/commitSelection'

interface Props {
  commits: Commit[]
  graph: GraphLayout
  selectedHash: string | null
  onSelect: (hash: string) => void
  onCherryPick: (hashes: string[]) => void
  onReset: (hash: string) => void
  onUndo: (oldestHash: string) => void
  onEditMessage: (hash: string) => void
  onRevert: (hashesNewestToOldest: string[]) => void
  onDrop: (hashes: string[]) => void
  onSquash: (hashes: string[]) => void
}

export function CommitGraph({
  commits,
  graph,
  selectedHash,
  onSelect,
  onCherryPick,
  onReset,
  onUndo,
  onEditMessage,
  onRevert,
  onDrop,
  onSquash,
}: Props) {
  const width = graphWidth(graph)
  const height = commits.length * ROW_H

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; acting: string[] } | null>(null)

  useEffect(() => {
    setSelected(new Set())
    setAnchor(null)
    setMenu(null)
  }, [commits])

  const handleClick = (row: number, hash: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor !== null) {
      const [lo, hi] = anchor < row ? [anchor, row] : [row, anchor]
      setSelected(new Set(commits.slice(lo, hi + 1).map((c) => c.hash)))
    } else if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(hash)) next.delete(hash)
        else next.add(hash)
        return next
      })
      setAnchor(row)
    } else {
      setSelected(new Set([hash]))
      setAnchor(row)
    }
    onSelect(hash)
  }

  const handleContextMenu = (hash: string, e: React.MouseEvent) => {
    e.preventDefault()
    // 우클릭이 멀티선택 내부면 선택 전체를, 아니면 해당 커밋만 대상으로.
    const acting = selected.has(hash) && selected.size > 1 ? [...selected] : [hash]
    setMenu({ x: e.clientX, y: e.clientY, acting })
  }

  const actingSet = menu ? new Set(menu.acting) : new Set<string>()
  const orderedOld = menu ? orderedOldestToNewest(commits, actingSet) : []

  const handleAction = (a: CommitAction) => {
    if (!menu) return
    const single = orderedOld[0]
    if (!single) return
    if (a === 'cherryPick') onCherryPick(orderedOld)
    else if (a === 'revert') onRevert([...orderedOld].reverse())
    else if (a === 'drop') onDrop(orderedOld)
    else if (a === 'squash') onSquash(orderedOld)
    else if (a === 'reset') onReset(single)
    else if (a === 'editMessage') onEditMessage(single)
    else if (a === 'undo') onUndo(single)
    else if (a === 'copyHash') navigator.clipboard?.writeText(single)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="relative" style={{ height }}>
        <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none">
          {graph.edges.map((e, i) => (
            <path
              key={i}
              d={`M ${cx(e.fromLane)} ${cy(e.fromRow)} C ${cx(e.fromLane)} ${cy(e.fromRow) + ROW_H / 2}, ${cx(e.toLane)} ${cy(e.toRow) - ROW_H / 2}, ${cx(e.toLane)} ${cy(e.toRow)}`}
              stroke={laneColor(e.fromLane)}
              strokeWidth={1.5}
              fill="none"
            />
          ))}
          {graph.nodes.map((n) => (
            <circle key={n.hash} cx={cx(n.lane)} cy={cy(n.row)} r={NODE_R} fill={laneColor(n.lane)} />
          ))}
        </svg>
        <div style={{ marginLeft: width }}>
          {commits.map((c, row) => {
            const isActive = c.hash === selectedHash
            const inSelection = selected.has(c.hash)
            const bg = isActive
              ? 'bg-blue-100 dark:bg-blue-500/30'
              : inSelection
                ? 'bg-blue-50 dark:bg-blue-500/15'
                : 'hover:bg-gray-100 dark:hover:bg-neutral-800'
            return (
              <button
                key={c.hash}
                onClick={(e) => handleClick(row, c.hash, e)}
                onContextMenu={(e) => handleContextMenu(c.hash, e)}
                style={{ height: ROW_H }}
                className={`w-full flex items-center gap-3 px-2 text-left whitespace-nowrap select-none ${bg}`}
              >
                {c.refs.length > 0 && (
                  <span className="flex gap-1">
                    {c.refs.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] bg-amber-200 dark:bg-amber-700 dark:text-amber-100 rounded px-1"
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                )}
                <span className="flex-1 truncate" title={c.subject}>
                  {c.subject}
                </span>
                <span className="text-gray-500 dark:text-neutral-400 w-20 truncate">{c.author}</span>
                <span className="text-gray-400 dark:text-neutral-500 w-16 text-right">
                  {c.dateISO.slice(0, 10)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {menu && (
        <CommitContextMenu
          x={menu.x}
          y={menu.y}
          count={menu.acting.length}
          shortHash={(orderedOld[0] ?? '').slice(0, 7)}
          canRewrite={isOnCurrentBranch(commits, actingSet)}
          canUndo={isContiguousFromHead(commits, actingSet)}
          canSquash={isContiguousRange(commits, actingSet)}
          onClose={() => setMenu(null)}
          onAction={handleAction}
        />
      )}
    </div>
  )
}
