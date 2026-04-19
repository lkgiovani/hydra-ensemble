import { useEffect, useMemo, useRef, useState } from 'react'
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
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#16161a] px-3 py-1 text-xs text-white/40">
        <span>no toolkit items</span>
        <button
          type="button"
          onClick={openEditor}
          className="rounded px-2 py-0.5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          configure…
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 border-b border-white/10 bg-[#16161a] px-2 py-1">
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
      <div className="ml-auto" />
      <button
        type="button"
        onClick={openEditor}
        className="rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10 hover:text-white"
        title="edit toolkit"
        aria-label="edit toolkit"
      >
        …
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

  const border =
    run?.status === 'success'
      ? 'border-emerald-400/60'
      : run?.status === 'error'
        ? 'border-red-400/60'
        : 'border-white/10'

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={onClick}
        title={item.command}
        className={`rounded border px-2 py-1 text-xs transition ${border} ${
          run?.status === 'running'
            ? 'bg-white/10 text-white/70'
            : 'bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      >
        {run?.status === 'running' ? '… ' : ''}
        {item.label}
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
  const ringColor =
    run.status === 'success'
      ? 'border-emerald-400/60'
      : run.status === 'error'
        ? 'border-red-400/60'
        : 'border-white/20'

  return (
    <div
      className={`absolute left-0 top-full z-30 mt-1 w-[28rem] rounded border bg-[#101014] p-2 text-xs text-white shadow-lg ${ringColor}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="text-white/60">
          {run.status === 'running'
            ? 'running…'
            : `exit ${run.result?.exitCode ?? '?'} · ${run.result?.durationMs ?? 0} ms`}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            className="rounded px-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            {expanded ? 'collapse' : 'expand'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 font-mono text-[11px] text-white/80">
          {(run.result?.stdout ?? '') + (run.result?.stderr ? `\n${run.result.stderr}` : '')}
        </pre>
      )}
    </div>
  )
}
