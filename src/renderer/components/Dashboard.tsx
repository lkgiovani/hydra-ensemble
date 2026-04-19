import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
  return `$${value.toFixed(2)}`
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
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-[#1c1c22] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">
            {session.name}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <SessionStatePill state={session.state} />
          </div>
        </div>
        <div className="text-right font-mono text-[11px] tabular-nums text-white/70">
          <div>{formatCost(cost)}</div>
          <div className="text-white/40">{model}</div>
        </div>
      </div>

      <div
        className="overflow-hidden text-[12px] leading-snug text-white/60"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical'
        }}
      >
        {previewText(session)}
      </div>

      <div className="mt-auto flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onFocus(session.id)}
          className="rounded bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/25"
        >
          focus
        </button>
        <button
          type="button"
          onClick={() => onRestart(session.id)}
          className="rounded bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/10"
        >
          restart
        </button>
        <button
          type="button"
          onClick={() => onDestroy(session.id)}
          className="rounded bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/25"
        >
          destroy
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
        <div className="flex flex-1 items-center justify-center text-sm text-white/40">
          no sessions to display
        </div>
      )
    }
    return (
      <div
        className="grid flex-1 gap-4 overflow-y-auto pr-1"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gridAutoRows: 'min-content'
        }}
      >
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
      className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c]/95 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex items-baseline justify-between px-10 pb-4 pt-10">
        <div>
          <div className="font-mono text-sm font-bold tracking-wider text-white">
            DASHBOARD
          </div>
          <div className="mt-1 font-mono text-[11px] text-white/50">
            All sessions at a glance. Press Esc or Cmd/Ctrl+D to close.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10 hover:text-white"
        >
          close
        </button>
      </div>
      <div className="flex flex-1 flex-col px-10 pb-10">{body}</div>
    </div>
  )

  return createPortal(overlay, document.body)
}
