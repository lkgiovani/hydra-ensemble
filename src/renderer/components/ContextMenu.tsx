import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onDismiss: () => void
}

export default function ContextMenu({ x, y, items, onDismiss }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onDismiss()
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    const onScroll = () => onDismiss()
    window.addEventListener('mousedown', onClick, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onDismiss)
    return () => {
      window.removeEventListener('mousedown', onClick, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onDismiss)
    }
  }, [onDismiss])

  // Clamp to viewport so the menu does not overflow.
  const left = Math.min(x, window.innerWidth - 200)
  const top = Math.min(y, window.innerHeight - items.length * 28 - 8)

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top }}
      className="fixed z-50 min-w-[180px] rounded border border-white/10 bg-[#1c1c20] py-1 text-xs text-white/85 shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return
            item.onSelect()
            onDismiss()
          }}
          className={`block w-full px-3 py-1.5 text-left transition ${
            item.disabled
              ? 'cursor-not-allowed text-white/30'
              : item.danger
                ? 'text-red-300 hover:bg-red-500/15'
                : 'hover:bg-white/10'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
