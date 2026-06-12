import { useRef } from 'react'

/**
 * A draggable divider. orientation 'vertical' is a vertical bar that resizes
 * width (col-resize); 'horizontal' is a horizontal bar that resizes height.
 * Calls onDrag with the pixel delta since the last mousemove.
 */
export function Splitter({
  orientation,
  onDrag,
}: {
  orientation: 'vertical' | 'horizontal'
  onDrag: (delta: number) => void
}) {
  const last = useRef(0)
  const vertical = orientation === 'vertical'

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    last.current = vertical ? e.clientX : e.clientY
    const move = (ev: MouseEvent) => {
      const cur = vertical ? ev.clientX : ev.clientY
      onDrag(cur - last.current)
      last.current = cur
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className={
        vertical
          ? 'w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-400/50'
          : 'h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-blue-400/50'
      }
    />
  )
}
