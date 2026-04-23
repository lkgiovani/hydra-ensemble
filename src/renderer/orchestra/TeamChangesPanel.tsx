import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  FileEdit,
  FilePlus,
  FileQuestion,
  FileSymlink,
  FileX,
  GitBranch,
  RefreshCw,
} from 'lucide-react'
import type { ChangedFile } from '../../shared/types'
import { useOrchestra } from './state/orchestra'

/** Icon + tailwind class per porcelain status. Kept local so the panel is
 *  self-contained — the classic GitChangesPanel uses single-letter labels,
 *  but Orchestra's sidebar is narrower so we lean on iconography instead. */
const STATUS_META: Record<
  ChangedFile['status'],
  { Icon: typeof FileEdit; label: string; cls: string }
> = {
  modified: { Icon: FileEdit, label: 'M', cls: 'text-amber-400' },
  added: { Icon: FilePlus, label: 'A', cls: 'text-emerald-400' },
  deleted: { Icon: FileX, label: 'D', cls: 'text-red-400' },
  untracked: { Icon: FileQuestion, label: 'U', cls: 'text-text-3' },
  renamed: { Icon: FileSymlink, label: 'R', cls: 'text-accent-400' },
}

type FilterMode = 'all' | 'staged' | 'unstaged'

const POLL_INTERVAL_MS = 5000

/** Format "Xs ago" / "Xm ago" from a millisecond timestamp. Intentionally
 *  lightweight — avoids pulling in date-fns just for a footer label. */
function formatRelative(from: number | null, now: number): string {
  if (from == null) return 'never'
  const diffMs = now - from
  if (diffMs < 0) return 'just now'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

/**
 * Live git-changes view for the active Orchestra team's worktree.
 *
 * Polls `window.api.git.listChangedFiles` every 5s and keeps a matching
 * `currentBranch` label in the header. All async ops use a generation
 * counter so a superseded fetch can't clobber newer UI state — same
 * pattern as the classic GitChangesPanel.
 */
export default function TeamChangesPanel() {
  const activeTeamId = useOrchestra((s) => s.activeTeamId)
  const team = useOrchestra((s) =>
    s.teams.find((t) => t.id === s.activeTeamId) ?? null
  )
  const worktreePath = team?.worktreePath ?? null

  const [files, setFiles] = useState<ChangedFile[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null)
  const [tick, setTick] = useState<number>(Date.now())

  // Generation counter — every async op captures the current value and
  // bails when superseded. Survives the component's lifetime.
  const gen = useRef(0)

  const loadStatus = useCallback(async (): Promise<void> => {
    if (!worktreePath) return
    const myGen = ++gen.current
    setLoading(true)
    setError(null)
    try {
      const [statusRes, branchValue] = await Promise.all([
        window.api.git.listChangedFiles(worktreePath),
        window.api.git.currentBranch(worktreePath),
      ])
      if (myGen !== gen.current) return // superseded
      if (!statusRes.ok) {
        setError(statusRes.error)
        setFiles([])
        return
      }
      setFiles(statusRes.value)
      setBranch(branchValue)
      setLastRefreshAt(Date.now())
    } catch (err) {
      if (myGen !== gen.current) return
      setError((err as Error).message)
    } finally {
      if (myGen === gen.current) setLoading(false)
    }
  }, [worktreePath])

  // Reset + auto-load + poll whenever the active team (or its worktree)
  // changes. Bumping `gen.current` on cleanup orphans any in-flight fetch
  // from the previous team so its response can't land on the new team's
  // state.
  useEffect(() => {
    gen.current += 1
    setFiles([])
    setBranch(null)
    setError(null)
    setLastRefreshAt(null)

    if (!worktreePath) return

    void loadStatus()
    const intervalId = window.setInterval(() => {
      void loadStatus()
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      gen.current += 1
    }
  }, [activeTeamId, worktreePath, loadStatus])

  // Separate ticker just so the "last refresh: Xs ago" label keeps moving
  // without triggering an actual git fetch. 1s is granular enough for a
  // human-readable label and cheap enough to ignore.
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return files
    if (filter === 'staged') return files.filter((f) => f.staged === true)
    return files.filter((f) => f.staged !== true)
  }, [files, filter])

  // Empty / unavailable states ------------------------------------------------

  if (!activeTeamId || !worktreePath) {
    return (
      <div className="flex h-full flex-col overflow-hidden border border-border-soft bg-bg-2">
        <Header
          branch={null}
          count={0}
          loading={false}
          onRefresh={() => undefined}
          refreshDisabled
        />
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <span className="font-mono text-[11px] text-text-4">
            No active team or worktree
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border-soft bg-bg-2">
      <Header
        branch={branch}
        count={files.length}
        loading={loading}
        onRefresh={() => void loadStatus()}
      />

      <FilterBar filter={filter} onChange={setFilter} />

      {error ? (
        <div className="flex shrink-0 items-start gap-1.5 border-b border-status-attention/40 bg-status-attention/10 px-3 py-2 font-mono text-[10.5px] text-status-attention">
          <AlertCircle
            size={12}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
          />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="shrink-0 rounded-sm border border-status-attention/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] hover:bg-status-attention/20"
          >
            retry
          </button>
        </div>
      ) : null}

      <ul className="df-scroll min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="flex h-full min-h-[80px] items-center justify-center px-3 py-6 text-center font-mono text-[11px] text-text-4">
            No changes
          </li>
        ) : (
          filtered.map((f) => {
            const meta = STATUS_META[f.status]
            const Icon = meta.Icon
            return (
              <li
                key={`${f.path}-${f.staged ? 's' : 'u'}`}
                className="flex items-center gap-2 border-b border-border-soft/40 px-3 py-1.5 text-[11px] hover:bg-bg-3/60"
                title={f.path}
              >
                <Icon
                  size={12}
                  strokeWidth={1.75}
                  className={`shrink-0 ${meta.cls}`}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-text-1">
                  {f.path}
                </span>
                <span
                  className={`shrink-0 font-mono text-[10px] font-semibold ${meta.cls}`}
                >
                  {meta.label}
                </span>
                {f.staged ? (
                  <span
                    className="shrink-0 rounded-sm bg-status-generating/15 px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-status-generating"
                    title="staged in the index"
                  >
                    staged
                  </span>
                ) : null}
              </li>
            )
          })
        )}
      </ul>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border-soft bg-bg-2 px-3 py-1.5">
        <span className="font-mono text-[10px] text-text-4">
          last refresh: {formatRelative(lastRefreshAt, tick)}
        </span>
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loading}
          className="flex items-center gap-1 rounded-sm border border-border-soft px-2 py-0.5 font-mono text-[10px] text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-40"
          title="Refresh now"
        >
          <RefreshCw
            size={10}
            strokeWidth={1.75}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents — kept in the same file so the panel is a single import.
// ---------------------------------------------------------------------------

function Header({
  branch,
  count,
  loading,
  onRefresh,
  refreshDisabled = false,
}: {
  branch: string | null
  count: number
  loading: boolean
  onRefresh: () => void
  refreshDisabled?: boolean
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border-soft bg-bg-2 px-3 py-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-2">
        Changes
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {branch ? (
          <span className="flex items-center gap-1 font-mono text-[10.5px] text-text-3">
            <GitBranch
              size={11}
              strokeWidth={1.75}
              className="text-accent-400"
            />
            <span className="truncate max-w-[140px]" title={branch}>
              {branch}
            </span>
            <span className="text-text-4">({count})</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshDisabled || loading}
          className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-40"
          title="Refresh changes"
          aria-label="Refresh changes"
        >
          <RefreshCw
            size={11}
            strokeWidth={1.75}
            className={loading ? 'animate-spin' : ''}
          />
        </button>
      </div>
    </header>
  )
}

function FilterBar({
  filter,
  onChange,
}: {
  filter: FilterMode
  onChange: (next: FilterMode) => void
}) {
  const options: FilterMode[] = ['all', 'staged', 'unstaged']
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border-soft bg-bg-2 px-2 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-4">
        Filter
      </span>
      <div className="ml-1 flex items-center gap-0.5">
        {options.map((opt) => {
          const active = opt === filter
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] transition ${
                active
                  ? 'bg-bg-3 text-text-1'
                  : 'text-text-3 hover:bg-bg-3/60 hover:text-text-1'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
