import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MoreHorizontal, Wrench, X } from 'lucide-react'
import { useToolkit } from '../../state/toolkit'
import { useSessions } from '../../state/sessions'
import EditorDialog from './EditorDialog'
import type { ToolkitItem, ToolkitRunResult } from '../../../shared/types'

/**
 * Horizontal bar of toolkit shortcuts. Each item runs against the
 * active session's cwd (or, when there is no session, the user's
 * home directory — handled main-side). Output appears in a popover
 * anchored under the button.
 */
export default function ToolkitBar() {
  const items = useToolkit((s) => s.items)
  const runs = useToolkit((s) => s.runs)
  const openId = useToolkit((s) => s.openPopoverId)
  const init = useToolkit((s) => s.init)
  const run = useToolkit((s) => s.run)
  const setOpenPopover = useToolkit((s) => s.setOpenPopover)
  const openEditor = useToolkit((s) => s.openEditor)
  const editorOpen = useToolkit((s) => s.editorOpen)

  const sessions = useSessions((s) => s.sessions)
  const activeId = useSessions((s) => s.activeId)

  const cwd = useMemo(() => {
    const active = sessions.find((s) => s.id === activeId)
    return active?.worktreePath ?? active?.cwd ?? ''
  }, [sessions, activeId])

  useEffect(() => {
    void init()
  }, [init])

  if (items.length === 0 && !editorOpen) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-4">
        <Wrench size={12} strokeWidth={1.75} />
        <span>No toolkit items</span>
        <button
          type="button"
          onClick={openEditor}
          className="rounded-md px-2 py-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
        >
          Configure
        </button>
        <EditorDialog />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {items.map((item) => (
        <ToolkitButton
          key={item.id}
          item={item}
          run={runs[item.id]}
          openOpen={openId === item.id}
          onClick={() => void run(item, cwd)}
          onTogglePopover={(open) => setOpenPopover(open ? item.id : null)}
        />
      ))}
      <button
        type="button"
        onClick={openEditor}
        className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
        title="Edit toolkit"
        aria-label="Edit toolkit"
      >
        <MoreHorizontal size={14} strokeWidth={1.75} />
      </button>
      <EditorDialog />
    </div>
  )
}

interface ButtonProps {
  item: ToolkitItem
  run: { status: 'running' | 'success' | 'error'; result?: ToolkitRunResult } | undefined
  openOpen: boolean
  onClick: () => void
  onTogglePopover: (open: boolean) => void
}

function ToolkitButton({ item, run, openOpen, onClick, onTogglePopover }: ButtonProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  // Auto-expand on error, keep collapsed on success (per spec).
  useEffect(() => {
    if (!run || run.status === 'running') return
    setExpanded(run.status === 'error')
  }, [run?.status, run?.result])

  // Click-outside to close the popover.
  useEffect(() => {
    if (!openOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (!anchorRef.current) return
      if (!anchorRef.current.contains(e.target as Node)) onTogglePopover(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [openOpen, onTogglePopover])

  const dot =
    run?.status === 'success'
      ? 'bg-status-generating'
      : run?.status === 'error'
        ? 'bg-status-attention'
        : null

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={onClick}
        title={item.command}
        className={`flex items-center gap-1.5 rounded-md border border-border-soft bg-bg-3 px-2.5 py-1 text-xs transition hover:border-border-mid hover:bg-bg-4 ${
          run?.status === 'running' ? 'text-text-3' : 'text-text-2 hover:text-text-1'
        }`}
      >
        {run?.status === 'running' ? (
          <Loader2 size={12} className="animate-spin text-text-3" />
        ) : (
          <Wrench size={12} strokeWidth={1.75} className="text-text-4" />
        )}
        <span className="font-medium">{item.label}</span>
        {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
      </button>
      {openOpen && run && (
        <ResultPopover
          run={run}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          onClose={() => onTogglePopover(false)}
        />
      )}
    </div>
  )
}

interface PopoverProps {
  run: { status: 'running' | 'success' | 'error'; result?: ToolkitRunResult }
  expanded: boolean
  onToggle: () => void
  onClose: () => void
}

function ResultPopover({ run, expanded, onToggle, onClose }: PopoverProps) {
  const accent =
    run.status === 'success'
      ? 'border-status-generating/40'
      : run.status === 'error'
        ? 'border-status-attention/40'
        : 'border-border-mid'

  return (
    <div
      className={`df-fade-in absolute left-0 top-full z-30 mt-1.5 w-[28rem] rounded-md border bg-bg-2 text-xs text-text-1 shadow-card ${accent}`}
    >
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <div className="flex items-center gap-2 text-text-3">
          {run.status === 'running' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Running…
            </>
          ) : (
            <>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  run.status === 'success' ? 'bg-status-generating' : 'bg-status-attention'
                }`}
              />
              <span className="font-mono">
                exit {run.result?.exitCode ?? '?'} · {run.result?.durationMs ?? 0}ms
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md px-2 py-0.5 text-[11px] text-text-3 hover:bg-bg-3 hover:text-text-1"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="Close output"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="df-scroll max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-b-md bg-bg-1 p-3 font-mono text-[11px] text-text-2">
          {(run.result?.stdout ?? '') + (run.result?.stderr ? `\n${run.result.stderr}` : '')}
        </pre>
      )}
    </div>
  )
}
