import type { Commit, GraphLayout } from '../../types'
import { ROW_H, NODE_R, cx, cy, laneColor, graphWidth } from './render'

interface Props {
  commits: Commit[]
  graph: GraphLayout
  selectedHash: string | null
  onSelect: (hash: string) => void
  onCherryPick: (hash: string) => void
}

export function CommitGraph({ commits, graph, selectedHash, onSelect, onCherryPick }: Props) {
  const width = graphWidth(graph)
  const height = commits.length * ROW_H

  return (
    <div className="flex-1 overflow-auto">
      <div className="relative" style={{ height }}>
        <svg
          width={width}
          height={height}
          className="absolute top-0 left-0 pointer-events-none"
        >
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
            <circle
              key={n.hash}
              cx={cx(n.lane)}
              cy={cy(n.row)}
              r={NODE_R}
              fill={laneColor(n.lane)}
            />
          ))}
        </svg>
        <div style={{ marginLeft: width }}>
          {commits.map((c) => (
            <button
              key={c.hash}
              onClick={() => onSelect(c.hash)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (window.confirm(`Cherry-pick ${c.hash.slice(0, 7)} 하시겠습니까?`)) onCherryPick(c.hash)
              }}
              style={{ height: ROW_H }}
              className={`w-full flex items-center gap-3 px-2 text-left whitespace-nowrap ${
                c.hash === selectedHash ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
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
              <span className="text-gray-400 w-16 text-right">
                {c.dateISO.slice(0, 10)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
