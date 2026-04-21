/**
 * DeleteTeamModal — centred confirmation modal for destructive team
 * deletion. PRD.md §10.F11.
 *
 * The user must type the team name exactly to enable the Delete button.
 * This mirrors the type-to-confirm pattern used by GitHub / Vercel for
 * repo/project deletion — slow enough to prevent muscle-memory mistakes,
 * fast enough that it's not an obstacle for users who really mean it.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { Team } from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'

/** Primary shape documented in the PRD: caller owns the open flag and
 *  passes id + name explicitly. */
interface IdProps {
  open: boolean
  onClose: () => void
  teamId: string
  teamName: string
}

/** Convenience shape used by TeamRail: passing the full Team object and
 *  letting presence of the prop stand in for "open". Mount-as-portal
 *  callers find this terser. */
interface TeamProps {
  onClose: () => void
  team: Team
  open?: boolean
}

type Props = IdProps | TeamProps

function normalize(props: Props): { open: boolean; id: string; name: string; onClose: () => void } {
  if ('team' in props) {
    return {
      open: props.open ?? true,
      id: props.team.id,
      name: props.team.name,
      onClose: props.onClose
    }
  }
  return { open: props.open, id: props.teamId, name: props.teamName, onClose: props.onClose }
}

/** Slugify the team name the same way the main process stores the folder
 *  on disk, so the warning text quotes the real path. Matches the backend
 *  rule: lowercase, spaces → dashes, strip everything that isn't
 *  alphanumeric, dash, or underscore. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function DeleteTeamModal(props: Props) {
  const { open, onClose, id: teamId, name: teamName } = normalize(props)
  const deleteTeam = useOrchestra((s) => s.deleteTeam)

  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset the typed confirmation whenever the modal re-opens. Keeping the
  // previous value around would let a mis-click on the context menu
  // instantly enable the red button.
  useEffect(() => {
    if (!open) return
    setConfirm('')
    setSubmitting(false)
  }, [open, teamId])

  // Autofocus the input so the user can start typing immediately.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Esc closes — but only when we're not mid-submit. Closing while the
  // delete IPC is in flight would orphan the pending promise and hide any
  // error toast behind a disappearing modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, submitting])

  if (!open) return null

  const matches = confirm === teamName
  const canDelete = matches && !submitting
  const slug = slugify(teamName)

  const submit = async (): Promise<void> => {
    if (!canDelete) return
    setSubmitting(true)
    try {
      await deleteTeam(teamId)
      // The store closes on success; on failure the toast fires inside
      // deleteTeam and we leave the modal open so the user can retry or
      // cancel. Either way, clear the spinner.
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="df-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-bg-0/85 px-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label="delete team"
        className="flex w-full max-w-md flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        <header className="flex items-center justify-between border-b border-border-soft bg-bg-1 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} strokeWidth={1.75} className="text-red-400" />
            <span className="df-label text-red-400">delete team</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
            aria-label="close"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs leading-relaxed text-text-2">
            This will delete the team{' '}
            <span className="font-mono text-text-1">{teamName}</span>, all its agents, all
            cached message logs, and the folder at{' '}
            <code className="rounded-sm bg-bg-3 px-1 font-mono text-[10px] text-text-1">
              ~/.hydra-ensemble/orchestra/teams/{slug}
            </code>
            . This cannot be undone.
          </p>

          <div>
            <label className="df-label mb-1.5 block">
              type the team name to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canDelete) void submit()
              }}
              placeholder={teamName}
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
              className={`w-full rounded-sm border bg-bg-1 px-2.5 py-1.5 font-mono text-sm text-text-1 placeholder:text-text-4 focus:outline-none disabled:opacity-50 ${
                matches
                  ? 'border-red-500/70 focus:border-red-500'
                  : 'border-border-mid focus:border-accent-500'
              }`}
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-1.5 border-t border-border-soft bg-bg-1 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-sm border border-border-soft px-3 py-1.5 text-xs text-text-2 hover:border-border-mid hover:bg-bg-3 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canDelete}
            className="rounded-sm bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'deleting…' : 'Delete team'}
          </button>
        </footer>
      </div>
    </div>
  )
}
