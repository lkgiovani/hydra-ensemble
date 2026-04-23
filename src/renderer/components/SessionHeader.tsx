import { useEffect, useRef, useState } from 'react'
import { Monitor, MessageSquare, Settings, X, Edit3 } from 'lucide-react'
import type { SessionViewMode } from '../../shared/types'
import { useSessions } from '../state/sessions'
import AgentAvatar from './AgentAvatar'
import SessionStatePill from './SessionStatePill'
import SessionQuickSettings from './SessionQuickSettings'

interface Props {
  sessionId: string
}

/**
 * Compact toolbar pinned to the top of an active session pane. Surfaces the
 * identity row (avatar + editable name + branch/model pills + state) on the
 * left, and the primary actions — view-mode toggle, quick settings popover,
 * and destructive close — on the right. All heavier controls live inside
 * SessionQuickSettings; this header only exposes the one-click essentials.
 */
export default function SessionHeader({ sessionId }: Props) {
  const session = useSessions((s) => s.sessions.find((x) => x.id === sessionId) ?? null)
  const patchSession = useSessions((s) => s.patchSession)

  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameHover, setNameHover] = useState(false)

  // Auto-focus and select the name input as soon as we enter edit mode so the
  // user can retype immediately without a second click.
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  // Auto-dismiss the destructive-confirm state if the user navigates away or
  // simply doesn't follow through. Keeps the UI honest — a stale confirm
  // prompt shouldn't linger across view changes.
  useEffect(() => {
    if (!confirmClose) return
    const timer = window.setTimeout(() => setConfirmClose(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirmClose])

  if (!session) return null

  const viewMode: SessionViewMode = session.viewMode ?? 'cli'

  const beginRename = (): void => {
    setNameDraft(session.name)
    setEditingName(true)
  }

  const commitRename = async (): Promise<void> => {
    const next = nameDraft.trim()
    setEditingName(false)
    if (!next || next === session.name) return
    await window.api.session.rename(sessionId, next)
    patchSession(sessionId, { name: next })
  }

  const cancelRename = (): void => {
    setEditingName(false)
    setNameDraft(session.name)
  }

  const handleSetViewMode = (mode: SessionViewMode): void => {
    if (mode === viewMode) return
    patchSession(sessionId, { viewMode: mode })
    void window.api.session.update(sessionId, { viewMode: mode })
  }

  const handleCloseRequest = (): void => {
    if (!confirmClose) {
      setConfirmClose(true)
      return
    }
    void window.api.session.destroy(sessionId)
  }

  return (
    <div className="flex items-center gap-2 border-b border-border-soft bg-bg-2 px-3 py-1.5">
      {/* Identity cluster */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <AgentAvatar session={session} size={22} />

        <div
          className="group relative flex min-w-0 items-center gap-1"
          onMouseEnter={() => setNameHover(true)}
          onMouseLeave={() => setNameHover(false)}
        >
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitRename()
                }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  cancelRename()
                }
              }}
              className="min-w-0 rounded-sm border border-accent-500 bg-bg-1 px-1.5 py-0.5 font-mono text-[12px] text-text-1 focus:outline-none"
              style={{ width: Math.max(80, Math.min(260, nameDraft.length * 8 + 24)) }}
              aria-label="rename session"
            />
          ) : (
            <button
              type="button"
              onDoubleClick={beginRename}
              title="double-click to rename"
              className="flex min-w-0 items-center gap-1 truncate rounded-sm px-1 py-0.5 font-mono text-[12px] text-text-1 hover:bg-bg-3"
            >
              <span className="truncate">{session.name}</span>
              {nameHover && (
                <Edit3
                  size={10}
                  strokeWidth={1.75}
                  className="shrink-0 text-text-4"
                  aria-hidden
                />
              )}
            </button>
          )}
        </div>

        {/* Meta pills */}
        <span className="text-text-4" aria-hidden>
          ·
        </span>

        {session.branch ? (
          <span
            className="truncate rounded-sm bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-text-3"
            title={`branch: ${session.branch}`}
          >
            {session.branch}
          </span>
        ) : null}

        {session.model ? (
          <span
            className="truncate rounded-sm bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-text-3"
            title={`model: ${session.model}`}
          >
            {session.model}
          </span>
        ) : null}

        <SessionStatePill state={session.state} />
      </div>

      {/* Right-side actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* View toggle */}
        <div
          className="inline-flex overflow-hidden rounded-sm border border-border-soft bg-bg-1"
          role="group"
          aria-label="view mode"
        >
          <HeaderToggle
            active={viewMode === 'cli'}
            onClick={() => handleSetViewMode('cli')}
            icon={<MessageSquare size={11} strokeWidth={1.75} />}
            label="CLI"
          />
          <HeaderToggle
            active={viewMode === 'visual'}
            onClick={() => handleSetViewMode('visual')}
            icon={<Monitor size={11} strokeWidth={1.75} />}
            label="Visual"
          />
        </div>

        {/* Settings */}
        <button
          ref={settingsBtnRef}
          type="button"
          onClick={() => setSettingsOpen((prev) => !prev)}
          aria-pressed={settingsOpen}
          aria-label="session settings"
          title="session settings"
          className={`rounded-sm border border-border-soft p-1 transition hover:border-border-mid hover:bg-bg-3 ${
            settingsOpen
              ? 'bg-accent-500/10 text-accent-400'
              : 'bg-bg-1 text-text-3 hover:text-text-1'
          }`}
        >
          <Settings size={12} strokeWidth={1.75} />
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={handleCloseRequest}
          aria-label={confirmClose ? 'confirm close session' : 'close session'}
          title={confirmClose ? 'click again to confirm' : 'close session'}
          className={`rounded-sm border p-1 transition ${
            confirmClose
              ? 'border-status-attention bg-status-attention/15 text-status-attention df-pulse'
              : 'border-border-soft bg-bg-1 text-text-3 hover:border-status-attention/60 hover:bg-status-attention/10 hover:text-status-attention'
          }`}
        >
          <X size={12} strokeWidth={1.75} />
        </button>
      </div>

      {/* Quick settings popover — anchored below the cog button */}
      <SessionQuickSettings
        sessionId={sessionId}
        anchorRef={settingsBtnRef}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

function HeaderToggle({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1 px-2 py-1 font-mono text-[10px] transition ${
        active
          ? 'bg-accent-500/15 text-accent-400'
          : 'text-text-3 hover:bg-bg-3 hover:text-text-1'
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
