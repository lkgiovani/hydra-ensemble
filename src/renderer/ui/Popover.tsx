import * as React from 'react'

interface PopoverProps {
  open: boolean
  onClose: () => void
  anchor?: { x: number; y: number }
  align?: 'start' | 'center' | 'end'
  children: React.ReactNode
}

export default function Popover(p: PopoverProps) {
  const { open, onClose, anchor, align = 'start', children } = p
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return
      if (e.target instanceof Node && !ref.current.contains(e.target)) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open, onClose])

  if (!open) return null

  const translateX = align === 'center' ? '-50%' : align === 'end' ? '-100%' : '0'
  const style: React.CSSProperties = anchor
    ? {
        position: 'absolute',
        left: anchor.x,
        top: anchor.y,
        transform: `translateX(${translateX})`,
      }
    : { position: 'absolute' }

  return (
    <div
      ref={ref}
      role="dialog"
      style={style}
      className="z-[70] min-w-[160px] rounded-md border border-border-mid bg-bg-1 p-1 shadow-pop df-fade-in"
    >
      {children}
    </div>
  )
}
