import * as React from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  titleIcon?: React.ReactNode
  maxWidth?: string
  children: React.ReactNode
  footer?: React.ReactNode
  closeOnBackdrop?: boolean
}

export default function Modal(p: ModalProps) {
  const {
    open,
    onClose,
    title,
    titleIcon,
    maxWidth = 'max-w-lg',
    children,
    footer,
    closeOnBackdrop = true,
  } = p

  React.useEffect(() => {
    if (!open) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!open) return null

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={onBackdropClick}
      className="fixed inset-0 z-[68] flex items-center justify-center bg-bg-0/85 px-4 backdrop-blur-md df-fade-in"
    >
      <div
        className={`w-full ${maxWidth} rounded-md border border-border-mid bg-bg-1 shadow-pop`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title !== undefined || titleIcon ? (
          <header className="flex items-center gap-2 border-b border-border-mid px-4 py-3">
            {titleIcon ? <span className="inline-flex text-text-2">{titleIcon}</span> : null}
            <h2 className="flex-1 truncate text-sm font-medium text-text-1">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-text-2 hover:bg-bg-3 hover:text-text-1"
            >
              <X size={14} />
            </button>
          </header>
        ) : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-sm text-text-2 hover:bg-bg-3 hover:text-text-1"
          >
            <X size={14} />
          </button>
        )}
        <div className="px-4 py-3 text-sm text-text-1">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-border-mid px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
