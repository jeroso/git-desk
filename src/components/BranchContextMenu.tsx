import { useLayoutEffect, useRef, useState } from 'react'

type Action = 'checkout' | 'newBranch' | 'merge' | 'rebase' | 'update' | 'push' | 'delete'

interface Props {
  x: number
  y: number
  branch: string
  isCurrent: boolean
  isRemote: boolean
  // 2개 이상 다중 선택된 상태에서 그 일부를 우클릭하면 값이 들어온다. 있으면 "일괄 삭제"만 노출.
  bulkCount?: number
  onClose: () => void
  onAction: (action: Action) => void
}

export function BranchContextMenu({ x, y, branch, isCurrent, isRemote, bulkCount, onClose, onAction }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Start at the click point; clamp into the viewport after we can measure the menu.
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 4
    let nx = x
    let ny = y
    if (x + r.width > window.innerWidth) nx = Math.max(margin, window.innerWidth - r.width - margin)
    // flip above the cursor if it would overflow the bottom edge
    if (y + r.height > window.innerHeight) ny = Math.max(margin, y - r.height)
    setPos({ x: nx, y: ny })
  }, [x, y])

  // `divider: true` renders a separator instead of a button.
  // 다중 선택(일괄 삭제) 모드: 단일 브랜치 전용 액션은 의미가 없으므로 삭제만 노출.
  const items: ({ key: Action; label: string; disabled?: boolean } | { divider: true })[] = bulkCount
    ? [{ key: 'delete', label: `${bulkCount}개 브랜치 삭제…` }]
    : [
        { key: 'checkout', label: `Checkout '${branch}'`, disabled: isCurrent },
        { key: 'newBranch', label: `New branch from '${branch}'…` },
        { divider: true },
        { key: 'merge', label: `Merge '${branch}' into current` },
        { key: 'rebase', label: `Rebase current onto '${branch}'` },
        // Push / Update only make sense for local branches.
        ...(isRemote
          ? []
          : ([
              { divider: true },
              { key: 'update', label: `Update '${branch}'` },
              { key: 'push', label: `Push '${branch}'` },
            ] as const)),
        { divider: true },
        {
          key: 'delete',
          label: isRemote ? `Delete remote '${branch}'…` : `Delete '${branch}'…`,
          disabled: isCurrent,
        },
      ]
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        className="fixed z-50 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg text-xs py-1 w-56"
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
