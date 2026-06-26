import { useLayoutEffect, useRef, useState } from 'react'

export type CommitAction =
  | 'reset'
  | 'editMessage'
  | 'undo'
  | 'revert'
  | 'drop'
  | 'squash'
  | 'cherryPick'
  | 'copyHash'

interface Props {
  x: number
  y: number
  count: number
  shortHash: string
  canRewrite: boolean // 선택이 현재 브랜치 조상인지 (edit/drop/squash 전제)
  canUndo: boolean // HEAD 연속 tip; single-select only
  canSquash: boolean // 선형 연속
  onClose: () => void
  onAction: (a: CommitAction) => void
}

type Item = { key: CommitAction; label: string; disabled?: boolean } | { divider: true }

export function CommitContextMenu({
  x,
  y,
  count,
  shortHash,
  canRewrite,
  canUndo,
  canSquash,
  onClose,
  onAction,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 4
    let nx = x
    let ny = y
    if (x + r.width > window.innerWidth) nx = Math.max(margin, window.innerWidth - r.width - margin)
    if (y + r.height > window.innerHeight) ny = Math.max(margin, y - r.height)
    setPos({ x: nx, y: ny })
  }, [x, y])

  const items: Item[] =
    count > 1
      ? [
          { key: 'cherryPick', label: `Cherry-Pick ${count} commits` },
          { key: 'revert', label: `Revert ${count} commits` },
          { divider: true },
          { key: 'drop', label: `Drop ${count} commits`, disabled: !canRewrite },
          { key: 'squash', label: `Squash ${count} commits`, disabled: !canRewrite || !canSquash },
        ]
      : [
          { key: 'reset', label: 'Reset Current Branch to Here…' },
          { key: 'editMessage', label: 'Edit Commit Message…', disabled: !canRewrite },
          { key: 'undo', label: 'Undo Commit', disabled: !canUndo },
          { divider: true },
          { key: 'revert', label: 'Revert Commit' },
          { key: 'drop', label: 'Drop Commit', disabled: !canRewrite },
          { key: 'cherryPick', label: 'Cherry-Pick' },
          { divider: true },
          { key: 'copyHash', label: `Copy Revision (${shortHash})` },
        ]

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={ref}
        className="fixed z-50 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg text-xs py-1 w-60"
        style={{ left: pos.x, top: pos.y }}
      >
        {items.map((it, i) =>
          'divider' in it ? (
            <div key={`d${i}`} className="my-1 border-t dark:border-neutral-700" />
          ) : (
            <button
              key={it.key}
              disabled={it.disabled}
              onClick={() => {
                onAction(it.key)
                onClose()
              }}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-neutral-700 dark:text-neutral-200 disabled:opacity-40"
            >
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  )
}
