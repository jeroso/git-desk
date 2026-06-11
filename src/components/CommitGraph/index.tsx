import { useEffect, useMemo, useState } from 'react'
import type { Commit, GraphLayout } from '../../types'
import { ROW_H, NODE_R, cx, cy, laneColor, graphWidth } from './render'

interface Props {
  commits: Commit[]
  graph: GraphLayout
  selectedHash: string | null
  onSelect: (hash: string) => void
  /** hashes ordered oldest→newest, ready to pass to `git cherry-pick`. */
  onCherryPick: (hashes: string[]) => void
}

export function CommitGraph({ commits, graph, selectedHash, onSelect, onCherryPick }: Props) {
  const width = graphWidth(graph)
  const height = commits.length * ROW_H

  // Multi-selection for batch operations (cherry-pick). Separate from `selectedHash`,
  // which is the single "active" commit driving the changed-files/diff panes.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)

  // Reset selection whenever the commit list changes (repo switch / refresh).
  useEffect(() => {
    setSelected(new Set())
    setAnchor(null)
  }, [commits])

  const indexOf = useMemo(() => {
    const m = new Map<string, number>()
    commits.forEach((c, i) => m.set(c.hash, i))
    return m
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
    // If the right-clicked commit is part of a multi-selection, act on the whole set.
    const target = selected.has(hash) && selected.size > 1 ? [...selected] : [hash]
    // Order oldest→newest (commits are listed newest-first, so larger index = older).
    const ordered = target
      .map((h) => ({ h, i: indexOf.get(h) ?? 0 }))
      .sort((a, b) => b.i - a.i)
      .map((x) => x.h)
    const label =
      ordered.length > 1
        ? `${ordered.length}개 커밋을 cherry-pick 하시겠습니까?`
        : `Cherry-pick ${hash.slice(0, 7)} 하시겠습니까?`
    if (window.confirm(label)) onCherryPick(ordered)
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
            const bg = isActive ? 'bg-blue-100' : inSelection ? 'bg-blue-50' : 'hover:bg-gray-100'
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
                      <span key={r} className="text-[10px] bg-amber-200 rounded px-1">
                        {r}
                      </span>
                    ))}
                  </span>
                )}
                <span className="flex-1 truncate">{c.subject}</span>
                <span className="text-gray-500 w-20 truncate">{c.author}</span>
                <span className="text-gray-400 w-16 text-right">{c.dateISO.slice(0, 10)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
