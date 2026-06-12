import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  x: number
  y: number
  branch: string
  isCurrent: boolean
  onClose: () => void
  onAction: (action: 'checkout' | 'newBranch' | 'merge' | 'rebase') => void
}

export function BranchContextMenu({ x, y, branch, isCurrent, onClose, onAction }: Props) {
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

  const items: { key: 'checkout' | 'newBranch' | 'merge' | 'rebase'; label: string }[] = [
    { key: 'checkout', label: `Checkout '${branch}'` },
    { key: 'newBranch', label: `New branch from '${branch}'…` },
    { key: 'merge', label: `Merge '${branch}' into current` },
    { key: 'rebase', label: `Rebase current onto '${branch}'` },
  ]
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        className="fixed z-50 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg text-xs py-1 w-56"
        style={{ left: pos.x, top: pos.y }}
      >
        {items.map((it) => (
          <button
            key={it.key}
            disabled={it.key === 'checkout' && isCurrent}
            onClick={() => {
              onAction(it.key)
              onClose()
            }}
            className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-neutral-700 dark:text-neutral-200 disabled:opacity-40"
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  )
}
