interface Props {
  x: number
  y: number
  branch: string
  isCurrent: boolean
  onClose: () => void
  onAction: (action: 'checkout' | 'merge' | 'rebase' | 'cherryPick') => void
}

export function BranchContextMenu({ x, y, branch, isCurrent, onClose, onAction }: Props) {
  const items: { key: 'checkout' | 'merge' | 'rebase'; label: string }[] = [
    { key: 'checkout', label: `Checkout '${branch}'` },
    { key: 'merge', label: `Merge '${branch}' into current` },
    { key: 'rebase', label: `Rebase current onto '${branch}'` },
  ]
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white border rounded shadow-lg text-xs py-1 w-56"
        style={{ left: x, top: y }}
      >
        {items.map((it) => (
          <button
            key={it.key}
            disabled={it.key === 'checkout' && isCurrent}
            onClick={() => {
              onAction(it.key)
              onClose()
            }}
            className="block w-full text-left px-3 py-1 hover:bg-gray-100 disabled:opacity-40"
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  )
}
