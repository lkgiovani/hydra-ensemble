import { useEffect, useRef, type ReactNode } from 'react'

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  icon?: ReactNode
  shortcut?: string
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onDismiss: () => void
}

const ROW_H = 30
const MENU_W = 200

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
  const left = Math.min(x, window.innerWidth - MENU_W - 8)
  const top = Math.min(y, window.innerHeight - items.length * ROW_H - 12)

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top }}
      className="fixed z-50 min-w-44 rounded-md border border-border-mid bg-bg-3 p-1 text-xs text-text-2 shadow-pop df-fade-in"
    >
      {items.map((item) => {
        const base =
          'group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors'
        const tone = item.disabled
          ? 'cursor-not-allowed text-text-4'
          : item.danger
            ? 'text-status-attention hover:bg-status-attention/10'
            : 'text-text-2 hover:bg-bg-4 hover:text-text-1'
        return (
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
            className={`${base} ${tone}`}
          >
            {item.icon !== undefined && (
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${
                  item.disabled ? 'text-text-4' : 'text-text-3'
                }`}
                aria-hidden
              >
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <kbd className="ml-2 rounded bg-bg-4 px-1.5 py-0.5 font-mono text-[10px] text-text-3">
                {item.shortcut}
              </kbd>
            )}
          </button>
        )
      })}
    </div>
  )
}
