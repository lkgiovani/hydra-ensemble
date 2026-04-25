import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import {
  DEFAULT_DURATION_MS,
  useToasts,
  type Toast,
  type ToastAction,
  type ToastKind
} from '../state/toasts'
import { useSessions } from '../state/sessions'

const KIND_STYLE: Record<
  ToastKind,
  { stripe: string; icon: React.ReactNode; progress: string }
> = {
  info: {
    stripe: 'bg-text-3',
    progress: 'bg-text-3',
    icon: <Info size={14} strokeWidth={1.75} className="text-text-2" />
  },
  success: {
    stripe: 'bg-status-generating',
    progress: 'bg-status-generating',
    icon: <CheckCircle2 size={14} strokeWidth={1.75} className="text-status-generating" />
  },
  warning: {
    stripe: 'bg-status-attention',
    progress: 'bg-status-attention',
    icon: <AlertTriangle size={14} strokeWidth={1.75} className="text-status-attention" />
  },
  attention: {
    stripe: 'bg-status-attention',
    progress: 'bg-status-attention',
    icon: (
      <AlertTriangle size={14} strokeWidth={1.75} className="text-status-attention df-pulse" />
    )
  },
  error: {
    stripe: 'bg-status-attention',
    progress: 'bg-status-attention',
    icon: <XCircle size={14} strokeWidth={1.75} className="text-status-attention" />
  }
}

const SWIPE_DISMISS_PX = 60
const SWIPE_MAX_FADE_PX = 140

const TOAST_KEYFRAMES = `@keyframes toast-progress-shrink {
  from { width: 100%; }
  to   { width: 0%; }
}`

export default function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  const setActive = useSessions((s) => s.setActive)

  // Escape dismisses the top (newest) toast only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const list = useToasts.getState().toasts
      if (list.length === 0) return
      const top = list[list.length - 1]
      if (!top) return
      dismiss(top.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-[60] flex w-[360px] flex-col-reverse gap-2">
      <style>{TOAST_KEYFRAMES}</style>
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => dismiss(t.id)}
          onFocus={() => {
            if (t.sessionId) setActive(t.sessionId)
            dismiss(t.id)
          }}
        />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
  onFocus
}: {
  toast: Toast
  onDismiss: () => void
  onFocus: () => void
}) {
  const style = KIND_STYLE[toast.kind]
  const duration = useMemo(() => {
    if (toast.pinned) return 0
    return typeof toast.durationMs === 'number'
      ? toast.durationMs
      : (DEFAULT_DURATION_MS[toast.kind] ?? 5_000)
  }, [toast.pinned, toast.durationMs, toast.kind])

  // Progress bar — drives purely from CSS animation so we don't re-render on a timer.
  const progressKey = `${toast.id}:${duration}:${toast.createdAt}`

  // Swipe-to-dismiss state.
  const [dragX, setDragX] = useState(0)
  const [exiting, setExiting] = useState(false)
  const pointerIdRef = useRef<number | null>(null)
  const startXRef = useRef(0)

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    // Only primary pointer; ignore if originating on an interactive child that
    // should receive the click (actions, close button). Those stopPropagation.
    if (e.button !== 0) return
    pointerIdRef.current = e.pointerId
    startXRef.current = e.clientX
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // setPointerCapture can throw if the element was already removed; safe to ignore.
    }
  }, [])

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return
    const dx = Math.max(0, e.clientX - startXRef.current)
    setDragX(dx)
  }, [])

  const endDrag = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return
      pointerIdRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      if (dragX >= SWIPE_DISMISS_PX) {
        setExiting(true)
        // Let the fade-out animation play, then remove from the store.
        window.setTimeout(onDismiss, 160)
      } else {
        setDragX(0)
      }
    },
    [dragX, onDismiss]
  )

  const fadeRatio = Math.min(1, dragX / SWIPE_MAX_FADE_PX)
  const opacity = exiting ? 0 : 1 - fadeRatio * 0.85
  const transform = exiting
    ? `translateX(${SWIPE_MAX_FADE_PX}px)`
    : dragX > 0
      ? `translateX(${dragX}px)`
      : undefined

  const handleActionClick = (action: ToastAction) => (e: React.MouseEvent) => {
    e.stopPropagation()
    action.onClick()
    onDismiss()
  }

  const hasClickableBody = Boolean(toast.sessionId)

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto df-slide-in relative flex overflow-hidden rounded-sm border border-border-mid bg-bg-2 shadow-pop"
      style={{
        opacity,
        transform,
        transition:
          pointerIdRef.current === null ? 'transform 180ms ease-out, opacity 180ms ease-out' : undefined,
        touchAction: 'pan-y'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className={`w-[3px] shrink-0 ${style.stripe}`} aria-hidden />
      <div
        className={`flex flex-1 items-start gap-2.5 px-3 py-2.5 text-left ${
          hasClickableBody ? 'cursor-pointer' : ''
        }`}
        onClick={hasClickableBody ? onFocus : undefined}
      >
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text-1">{toast.title}</div>
          {toast.body ? (
            <div className="mt-0.5 line-clamp-2 font-mono text-[11px] text-text-3">
              {toast.body}
            </div>
          ) : null}
          {toast.actions && toast.actions.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-3">
              {toast.actions.map((a, i) => (
                <button
                  key={`${a.label}:${i}`}
                  type="button"
                  onClick={handleActionClick(a)}
                  className="text-[11px] font-semibold uppercase tracking-wide text-accent-400 hover:text-accent-200"
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        className="shrink-0 px-2 text-text-4 hover:text-text-1"
        title="dismiss"
        aria-label="dismiss"
      >
        <X size={12} strokeWidth={1.75} />
      </button>
      {duration > 0 ? (
        <div
          key={progressKey}
          className={`toast-progress absolute bottom-0 left-0 h-[2px] ${style.progress}`}
          style={
            {
              width: '100%',
              animation: `toast-progress-shrink ${duration}ms linear forwards`
            } as React.CSSProperties
          }
          aria-hidden
        />
      ) : null}
    </div>
  )
}
