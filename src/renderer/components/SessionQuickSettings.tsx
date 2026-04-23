import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bot, Eye, RotateCw, Edit3, X, Check, Zap } from 'lucide-react'
import type { SessionViewMode } from '../../shared/types'
import { useSessions } from '../state/sessions'

interface Props {
  sessionId: string
  anchorRef?: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
}

type ModelId = 'opus' | 'sonnet' | 'haiku'

interface ModelOption {
  id: ModelId
  name: string
  role: string
  cost: string
}

const MODEL_OPTIONS: readonly ModelOption[] = [
  { id: 'opus', name: 'opus', role: 'deep reasoning', cost: 'high $' },
  { id: 'sonnet', name: 'sonnet', role: 'balanced', cost: 'mid $' },
  { id: 'haiku', name: 'haiku', role: 'quick / cheap', cost: 'low $' }
] as const

const POPOVER_WIDTH = 280
const POPOVER_GAP = 6
const POPOVER_MARGIN = 8

type AnchorRect = { top: number; left: number } | null

/**
 * Quick settings popover anchored to the session header. Centralizes the
 * model picker, view-mode toggle, auto-commit shortcut, rename, restart,
 * and destroy actions so they're one click away from inside the session.
 *
 * Model switching isn't exposed through the sessions store yet, so selection
 * fires a `session:changeModel` CustomEvent on window. TODO: wire this to a
 * real store action once the backend patch endpoint lands.
 */
export default function SessionQuickSettings({
  sessionId,
  anchorRef,
  open,
  onClose
}: Props) {
  const session = useSessions((s) => s.sessions.find((x) => x.id === sessionId) ?? null)
  const patchSession = useSessions((s) => s.patchSession)

  const popoverRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const [anchorRect, setAnchorRect] = useState<AnchorRect>(null)
  const [selectedModel, setSelectedModel] = useState<ModelId>('sonnet')
  const [viewMode, setViewMode] = useState<SessionViewMode>('cli')
  const [renameValue, setRenameValue] = useState<string>('')
  const [renameDirty, setRenameDirty] = useState<boolean>(false)
  const [confirmClose, setConfirmClose] = useState<boolean>(false)

  // Hydrate local state from the current session whenever the popover opens
  // or the underlying session meta changes. Keeps the UI in sync with
  // out-of-band updates (e.g. another view renaming the session).
  useEffect(() => {
    if (!session) return
    const rawModel = (session.model ?? '').toLowerCase()
    const nextModel: ModelId = rawModel.includes('opus')
      ? 'opus'
      : rawModel.includes('haiku')
        ? 'haiku'
        : 'sonnet'
    setSelectedModel(nextModel)
    setViewMode(session.viewMode ?? 'cli')
    if (!renameDirty) setRenameValue(session.name)
  }, [session, renameDirty])

  // Reset ephemeral UI state every time the popover is re-opened so stale
  // confirm prompts or half-typed renames don't leak across openings.
  useEffect(() => {
    if (!open) {
      setConfirmClose(false)
      setRenameDirty(false)
    }
  }, [open])

  // Anchor positioning — measure the anchor element on open and whenever
  // the viewport changes size so the popover tracks it cleanly. Fallback to
  // a viewport-centered layout when no anchor is provided.
  useLayoutEffect(() => {
    if (!open) return
    const measure = (): void => {
      const el = anchorRef?.current ?? null
      if (!el) {
        setAnchorRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      setAnchorRect({ top: r.bottom + POPOVER_GAP, left: r.left })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchorRef])

  // Escape closes. Attached at window level so focus-in-popover or
  // focus-outside both receive it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Click-outside — ignore clicks inside the popover itself or inside the
  // anchor (so clicking the same button that opened it doesn't immediately
  // re-close after the parent toggles open again).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  // Clamp the popover inside the viewport. Computed from the raw anchor
  // rect — avoids reading layout from the DOM after render.
  const positionStyle = useMemo<React.CSSProperties>(() => {
    if (!anchorRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: POPOVER_WIDTH
      }
    }
    const maxLeft = Math.max(
      POPOVER_MARGIN,
      window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN
    )
    const left = Math.min(Math.max(POPOVER_MARGIN, anchorRect.left), maxLeft)
    const top = Math.max(POPOVER_MARGIN, anchorRect.top)
    return {
      position: 'fixed',
      top,
      left,
      width: POPOVER_WIDTH
    }
  }, [anchorRect])

  if (!open || !session) return null

  const handlePickModel = (id: ModelId): void => {
    setSelectedModel(id)
    // TODO: once sessions store exposes `setModel`, call it here and drop
    // this event. Visible contract preserved so consumers can listen today.
    window.dispatchEvent(
      new CustomEvent('session:changeModel', { detail: { sessionId, model: id } })
    )
  }

  const handleSetViewMode = (mode: SessionViewMode): void => {
    if (mode === viewMode) return
    setViewMode(mode)
    patchSession(sessionId, { viewMode: mode })
    void window.api.session.update(sessionId, { viewMode: mode })
  }

  const handleOpenAutoCommit = (): void => {
    window.dispatchEvent(
      new CustomEvent('session:openAutoCommit', { detail: { sessionId } })
    )
  }

  const handleRestart = async (): Promise<void> => {
    await window.api.session.restart(sessionId)
    onClose()
  }

  const commitRename = async (): Promise<void> => {
    const next = renameValue.trim()
    if (!next || next === session.name) {
      setRenameDirty(false)
      setRenameValue(session.name)
      return
    }
    await window.api.session.rename(sessionId, next)
    patchSession(sessionId, { name: next })
    setRenameDirty(false)
  }

  const handleConfirmDestroy = async (): Promise<void> => {
    await window.api.session.destroy(sessionId)
    onClose()
  }

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="session quick settings"
      className="z-50 border border-border-mid bg-bg-2 p-3 text-text-1 shadow-pop df-fade-in"
      style={{ ...positionStyle, borderRadius: 8 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={11} strokeWidth={1.75} className="text-accent-400" />
          <span className="df-label">quick settings</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
          aria-label="close"
        >
          <X size={12} strokeWidth={1.75} />
        </button>
      </div>

      {/* Model picker */}
      <section className="mb-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Bot size={10} strokeWidth={1.75} className="text-text-3" />
          <span className="df-label">model</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MODEL_OPTIONS.map((opt) => {
            const active = selectedModel === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handlePickModel(opt.id)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-0.5 rounded-sm border px-2 py-1.5 text-left transition ${
                  active
                    ? 'border-accent-500 bg-accent-500/10 ring-1 ring-accent-500'
                    : 'border-border-soft bg-bg-1 hover:border-border-mid hover:bg-bg-3'
                }`}
              >
                <span
                  className={`font-mono text-[11px] font-semibold ${
                    active ? 'text-accent-400' : 'text-text-1'
                  }`}
                >
                  {opt.name}
                </span>
                <span className="font-mono text-[9px] text-text-3">{opt.role}</span>
                <span className="font-mono text-[9px] text-text-4">{opt.cost}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* View mode */}
      <section className="mb-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Eye size={10} strokeWidth={1.75} className="text-text-3" />
          <span className="df-label">view mode</span>
        </div>
        <div
          className="grid grid-cols-2 gap-0 overflow-hidden rounded-sm border border-border-soft bg-bg-1"
          role="group"
          aria-label="view mode"
        >
          <ToggleButton
            active={viewMode === 'cli'}
            onClick={() => handleSetViewMode('cli')}
            label="cli"
          />
          <ToggleButton
            active={viewMode === 'visual'}
            onClick={() => handleSetViewMode('visual')}
            label="visual"
          />
        </div>
      </section>

      {/* Rename */}
      <section className="mb-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Edit3 size={10} strokeWidth={1.75} className="text-text-3" />
          <span className="df-label">name</span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => {
              setRenameValue(e.target.value)
              setRenameDirty(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setRenameValue(session.name)
                setRenameDirty(false)
              }
            }}
            placeholder={session.name}
            className="flex-1 rounded-sm border border-border-mid bg-bg-1 px-2 py-1 font-mono text-[11px] text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void commitRename()}
            disabled={!renameDirty || !renameValue.trim()}
            className="rounded-sm border border-border-soft bg-bg-1 p-1 text-text-3 hover:border-border-mid hover:bg-bg-3 hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="save name"
            title="save name"
          >
            <Check size={12} strokeWidth={1.75} />
          </button>
        </div>
      </section>

      {/* Actions */}
      <section>
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="df-label">actions</span>
        </div>
        <div className="flex flex-col gap-1">
          <ActionButton
            icon={<Zap size={12} strokeWidth={1.75} />}
            label="auto-commit settings"
            onClick={handleOpenAutoCommit}
          />
          <ActionButton
            icon={<RotateCw size={12} strokeWidth={1.75} />}
            label="restart session"
            onClick={() => void handleRestart()}
          />
          {confirmClose ? (
            <div className="flex items-center gap-1.5 rounded-sm border border-status-attention/60 bg-status-attention/10 px-2 py-1.5">
              <span className="flex-1 font-mono text-[11px] text-text-1">close session?</span>
              <button
                type="button"
                onClick={() => void handleConfirmDestroy()}
                className="rounded-sm bg-status-attention px-2 py-0.5 font-mono text-[10px] font-semibold text-white hover:brightness-110"
              >
                yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="rounded-sm border border-border-soft px-2 py-0.5 font-mono text-[10px] text-text-2 hover:bg-bg-3 hover:text-text-1"
              >
                no
              </button>
            </div>
          ) : (
            <ActionButton
              icon={<X size={12} strokeWidth={1.75} />}
              label="close session"
              onClick={() => setConfirmClose(true)}
              tone="danger"
            />
          )}
        </div>
      </section>
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  label
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2 py-1 font-mono text-[11px] transition ${
        active
          ? 'bg-accent-500/15 text-accent-400'
          : 'text-text-3 hover:bg-bg-3 hover:text-text-1'
      }`}
    >
      {label}
    </button>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  tone = 'default'
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-sm border border-border-soft bg-bg-1 px-2 py-1.5 text-left font-mono text-[11px] transition hover:border-border-mid hover:bg-bg-3 ${
        tone === 'danger' ? 'text-status-attention hover:text-status-attention' : 'text-text-2 hover:text-text-1'
      }`}
    >
      <span
        className={tone === 'danger' ? 'text-status-attention' : 'text-text-3'}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  )
}
