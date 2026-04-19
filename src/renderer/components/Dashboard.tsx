import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  DollarSign,
  LayoutDashboard,
  RotateCw,
  Trash2,
  X
} from 'lucide-react'
import { useSessions } from '../state/sessions'
import type { SessionMeta } from '../../shared/types'
import SessionStatePill from './SessionStatePill'

interface Props {
  open: boolean
  onClose: () => void
}

interface CardProps {
  session: SessionMeta
  onFocus: (id: string) => void
  onRestart: (id: string) => void
  onDestroy: (id: string) => void
}

function formatCost(value: number): string {
  return value.toFixed(2)
}

function previewText(session: SessionMeta): string {
  const text = session.latestAssistantText
  if (text && text.trim().length > 0) return text
  return 'No assistant response yet for this session.'
}

function DashboardCard({ session, onFocus, onRestart, onDestroy }: CardProps) {
  const cost = session.cost ?? 0
  const model = session.model ?? 'sonnet'

  return (
    <div className="df-lift flex flex-col gap-3 rounded-md border border-border-soft bg-bg-3 p-4 hover:border-border-mid hover:bg-bg-4">
      <div className="flex items-start justify-between gap-2">
        <SessionStatePill state={session.state} />
        <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-text-3">
          <DollarSign size={11} strokeWidth={1.75} className="text-text-4" />
          <span className="text-text-2">{formatCost(cost)}</span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-1">
          {session.name}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-text-4">
          {model}
        </div>
      </div>

      <div
        className="font-mono text-xs leading-snug text-text-3"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {previewText(session)}
      </div>

      <div className="mt-auto flex items-center justify-end gap-1 border-t border-border-soft pt-3">
        <button
          type="button"
          onClick={() => onFocus(session.id)}
          className="flex items-center gap-1.5 rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
          title="Focus session"
          aria-label="focus"
        >
          <Activity size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => onRestart(session.id)}
          className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
          title="Restart session"
          aria-label="restart"
        >
          <RotateCw size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => onDestroy(session.id)}
          className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-status-attention"
          title="Destroy session"
          aria-label="destroy"
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

export default function Dashboard({ open, onClose }: Props) {
  const sessions = useSessions((s) => s.sessions)
  const setActive = useSessions((s) => s.setActive)
  const destroySession = useSessions((s) => s.destroySession)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleFocus = (id: string): void => {
    setActive(id)
    onClose()
  }

  const handleRestart = (id: string): void => {
    // eslint-disable-next-line no-console
    console.log('[dashboard] restart not implemented yet', id)
  }

  const handleDestroy = (id: string): void => {
    void destroySession(id)
  }

  const body = useMemo(() => {
    if (sessions.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
          <LayoutDashboard size={32} strokeWidth={1.25} className="text-text-4" />
          <div className="text-sm text-text-2">No active sessions</div>
          <div className="text-xs text-text-4">
            Open a project and create a session to get started.
          </div>
        </div>
      )
    }
    return (
      <div className="df-scroll grid flex-1 gap-4 overflow-y-auto pr-1 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] [grid-auto-rows:min-content]">
        {sessions.map((s) => (
          <DashboardCard
            key={s.id}
            session={s}
            onFocus={handleFocus}
            onRestart={handleRestart}
            onDestroy={handleDestroy}
          />
        ))}
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions])

  if (!open) return null

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/85 p-8 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="df-fade-in flex max-h-[90vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-lg border border-border-mid bg-bg-2 shadow-pop">
        <header className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex items-center gap-2.5">
            <LayoutDashboard size={16} strokeWidth={1.75} className="text-text-2" />
            <div className="text-sm font-semibold text-text-1">Dashboard</div>
            <div className="text-xs text-text-4">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="Close dashboard"
            title="Esc"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden p-5">{body}</div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
