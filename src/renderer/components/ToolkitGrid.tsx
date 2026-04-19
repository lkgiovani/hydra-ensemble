import { Wrench, Settings2, Play, Loader2, AlertCircle, Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useToolkit } from '../state/toolkit'
import type { ToolkitItem } from '../../shared/types'

interface Props {
  cwd: string | null
  projectName?: string
  branch?: string
}

export default function ToolkitGrid({ cwd, projectName, branch }: Props) {
  const items = useToolkit((s) => s.items)
  const runs = useToolkit((s) => s.runs)
  const run = useToolkit((s) => s.run)
  const openEditor = useToolkit((s) => s.openEditor)

  return (
    <section className="flex h-full flex-col border-l border-t border-border-soft bg-bg-2">
      <header className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Wrench size={14} strokeWidth={1.75} className="text-accent-400" />
          <span className="font-semibold text-text-1">Toolkit</span>
          {projectName ? (
            <span className="flex items-center gap-1 text-xs text-text-3">
              <span className="text-text-4">·</span>
              <span className="font-mono">{projectName}</span>
              {branch ? (
                <>
                  <span className="text-text-4">·</span>
                  <span className="font-mono text-text-3">{branch}</span>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={openEditor}
          className="rounded p-1 text-text-4 hover:bg-bg-3 hover:text-text-1"
          title="edit toolkit"
          aria-label="edit toolkit"
        >
          <Settings2 size={13} strokeWidth={1.75} />
        </button>
      </header>

      <div className="df-scroll flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Wrench size={28} strokeWidth={1.25} className="text-text-4" />
            <div className="text-sm text-text-2">no toolkit items</div>
            <button
              type="button"
              onClick={openEditor}
              className="mt-1 rounded-md bg-accent-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-600"
            >
              add your first command
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((it) => (
              <ToolkitButton
                key={it.id}
                item={it}
                runState={runs[it.id]}
                disabled={!cwd}
                onRun={() => cwd && void run(it, cwd)}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-1 border-t border-border-soft px-2 py-1.5 text-xs">
        <button
          type="button"
          onClick={openEditor}
          className="rounded px-2 py-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
        >
          + Add
        </button>
        <button
          type="button"
          onClick={openEditor}
          className="rounded px-2 py-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
        >
          Edit
        </button>
        <span className="ml-auto text-[10px] text-text-4">
          {cwd ? '' : 'pick a project to enable'}
        </span>
      </footer>
    </section>
  )
}

function ToolkitButton({
  item,
  runState,
  disabled,
  onRun
}: {
  item: ToolkitItem
  runState?: { status: 'running' | 'success' | 'error'; result?: { exitCode: number; durationMs: number; stdout: string; stderr: string } }
  disabled: boolean
  onRun: () => void
}) {
  const [showOutput, setShowOutput] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showOutput) return
    const onClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setShowOutput(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [showOutput])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        title={disabled ? 'no project selected' : item.command}
        className={`group flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-all df-lift ${
          disabled
            ? 'cursor-not-allowed border-border-soft bg-bg-3/50 text-text-4'
            : runState?.status === 'success'
              ? 'border-status-generating/30 bg-bg-3 text-text-1 hover:border-status-generating/60 hover:bg-bg-4'
              : runState?.status === 'error'
                ? 'border-status-attention/30 bg-bg-3 text-text-1 hover:border-status-attention/60 hover:bg-bg-4'
                : 'border-border-soft bg-bg-3 text-text-1 hover:border-border-mid hover:bg-bg-4'
        }`}
      >
        <span className="truncate font-medium">{item.label || item.id}</span>
        <ToolkitStatusIcon status={runState?.status} />
      </button>

      {runState?.result ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowOutput((v) => !v)
          }}
          className="absolute -bottom-1 right-1 rounded bg-bg-1/90 p-0.5 text-text-4 opacity-0 transition group-hover:opacity-100 hover:text-text-1"
          title="show output"
          aria-label="show output"
        >
          <ChevronDown size={10} strokeWidth={1.75} />
        </button>
      ) : null}

      {showOutput && runState?.result ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border-mid bg-bg-3 p-2 shadow-pop df-fade-in df-scroll">
          <div className="mb-1 flex items-center justify-between text-[10px] text-text-4">
            <span>exit {runState.result.exitCode}</span>
            <span>{(runState.result.durationMs / 1000).toFixed(2)}s</span>
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-text-2">
            {runState.result.stdout || runState.result.stderr || '(no output)'}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

function ToolkitStatusIcon({ status }: { status?: 'running' | 'success' | 'error' }) {
  if (status === 'running') {
    return (
      <Loader2
        size={12}
        strokeWidth={2}
        className="shrink-0 animate-spin text-accent-400"
        aria-label="running"
      />
    )
  }
  if (status === 'success') {
    return (
      <Check size={12} strokeWidth={2.25} className="shrink-0 text-status-generating" aria-label="success" />
    )
  }
  if (status === 'error') {
    return (
      <AlertCircle
        size={12}
        strokeWidth={2}
        className="shrink-0 text-status-attention"
        aria-label="error"
      />
    )
  }
  return <Play size={11} strokeWidth={1.75} className="shrink-0 text-text-4" aria-label="run" />
}
