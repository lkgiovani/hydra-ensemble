import { useEffect, useMemo } from 'react'
import { useGh } from '../state/gh'
import type { PRCheck, PRInfo } from '../../shared/types'

const REFRESH_MS = 5 * 60 * 1000

function StateBadge({ state, isDraft }: { state: PRInfo['state']; isDraft: boolean }) {
  let cls = 'bg-emerald-500/20 text-emerald-300'
  let label: string = state.toLowerCase()
  if (isDraft) {
    cls = 'bg-white/10 text-white/60'
    label = 'draft'
  } else if (state === 'MERGED') {
    cls = 'bg-violet-500/20 text-violet-300'
  } else if (state === 'CLOSED') {
    cls = 'bg-red-500/20 text-red-300'
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${cls}`}>
      {label}
    </span>
  )
}

function CheckRow({ c }: { c: PRCheck }) {
  let dot = 'bg-white/30'
  if (c.conclusion === 'success') dot = 'bg-emerald-400'
  else if (c.conclusion === 'failure' || c.conclusion === 'cancelled') dot = 'bg-red-400'
  else if (c.status === 'in_progress' || c.status === 'queued') dot = 'bg-amber-400'
  else if (c.conclusion === 'skipped') dot = 'bg-white/30'
  return (
    <div className="flex items-center gap-2 truncate text-[11px] text-white/70">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{c.name}</span>
      <span className="text-white/40">{c.conclusion ?? c.status}</span>
    </div>
  )
}

function DiffView({ diff }: { diff: string }) {
  const lines = useMemo(() => diff.split('\n'), [diff])
  return (
    <pre className="overflow-x-auto rounded bg-black/30 p-2 font-mono text-[11px] leading-snug">
      {lines.map((line, i) => {
        let cls = 'text-white/60'
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-emerald-300'
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-300'
        else if (line.startsWith('@@')) cls = 'text-sky-300'
        else if (line.startsWith('diff ')) cls = 'text-violet-300'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

interface Props {
  cwd: string | null
  open: boolean
  onClose: () => void
}

export default function PRInspector({ cwd, open, onClose }: Props) {
  const stateCwd = useGh((s) => s.cwd)
  const prs = useGh((s) => s.prs)
  const loading = useGh((s) => s.loading)
  const error = useGh((s) => s.error)
  const selected = useGh((s) => s.selected)
  const selectedLoading = useGh((s) => s.selectedLoading)
  const expandedNumber = useGh((s) => s.expandedNumber)
  const openPanel = useGh((s) => s.openPanel)
  const closePanel = useGh((s) => s.closePanel)
  const refresh = useGh((s) => s.refresh)
  const selectPR = useGh((s) => s.selectPR)
  const collapsePR = useGh((s) => s.collapsePR)

  // Sync open prop → store; reset selection when cwd changes.
  useEffect(() => {
    if (open && cwd && cwd !== stateCwd) {
      openPanel(cwd)
    } else if (!open) {
      closePanel()
    }
  }, [open, cwd, stateCwd, openPanel, closePanel])

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => {
      void refresh()
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [open, refresh])

  if (!open) return null

  const ghMissing = error?.includes('not installed')

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-[420px] flex-col border-l border-white/10 bg-[#101014] shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="font-mono text-[11px] font-bold tracking-wider text-white/80">
          PRS
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
            disabled={loading}
          >
            {loading ? '...' : 'refresh'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
          >
            close
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {ghMissing && (
          <div className="m-3 rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
            <div className="font-medium">gh CLI not installed</div>
            <div className="mt-1 text-yellow-200/70">
              Install from{' '}
              <a className="underline" href="https://cli.github.com" target="_blank" rel="noreferrer">
                cli.github.com
              </a>
              , then `gh auth login`.
            </div>
          </div>
        )}
        {!ghMissing && error && (
          <div className="m-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            {error}
          </div>
        )}
        {prs.length === 0 && !loading && !error && (
          <div className="p-4 text-xs text-white/40">no pull requests</div>
        )}
        {prs.map((pr) => {
          const expanded = pr.number === expandedNumber
          return (
            <div key={pr.number} className="border-b border-white/5">
              <button
                type="button"
                onClick={() => (expanded ? collapsePR() : void selectPR(pr.number))}
                className="flex w-full flex-col gap-1 px-3 py-2 text-left text-xs hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white/50">#{pr.number}</span>
                  <StateBadge state={pr.state} isDraft={pr.isDraft} />
                  <span className="ml-auto text-[10px] text-white/40">{pr.author}</span>
                </div>
                <div className="truncate text-white/80">{pr.title}</div>
              </button>
              {expanded && (
                <div className="space-y-3 border-t border-white/5 bg-black/20 p-3">
                  {selectedLoading && <div className="text-xs text-white/40">loading...</div>}
                  {selected && (
                    <>
                      {selected.body && (
                        <div className="whitespace-pre-wrap text-[11px] text-white/70">
                          {selected.body}
                        </div>
                      )}
                      <div className="space-y-1">
                        {selected.checks.length === 0 && (
                          <div className="text-[11px] text-white/40">no checks</div>
                        )}
                        {selected.checks.map((c, i) => (
                          <CheckRow key={`${c.name}-${i}`} c={c} />
                        ))}
                      </div>
                      {selected.diff && <DiffView diff={selected.diff} />}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
