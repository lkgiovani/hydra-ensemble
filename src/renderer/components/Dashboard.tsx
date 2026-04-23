import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpDown,
  Filter,
  Info,
  LayoutDashboard,
  Plus,
  X
} from 'lucide-react'
import { useSessions } from '../state/sessions'
import { useSpawnDialog } from '../state/spawn'
import type { SessionMeta } from '../../shared/types'
import { fmtShortcut } from '../lib/platform'
import SessionCard from './SessionCard'

interface Props {
  open: boolean
  onClose: () => void
  /** 'inline' renders a self-contained pane (no portal/backdrop). */
  mode?: 'inline' | 'overlay'
}

type FilterId = 'all' | 'running' | 'idle' | 'errors'
type SortId = 'recent' | 'name' | 'cost'

const FILTERS: Array<{
  id: FilterId
  label: string
  matches: (s: SessionMeta) => boolean
}> = [
  { id: 'all', label: 'all', matches: () => true },
  {
    id: 'running',
    label: 'running',
    matches: (s) => s.state === 'thinking' || s.state === 'generating'
  },
  {
    id: 'idle',
    label: 'idle',
    matches: (s) => s.state === 'idle' || s.state === 'userInput' || !s.state
  },
  {
    id: 'errors',
    label: 'errors',
    matches: (s) => s.state === 'needsAttention'
  }
]

const SORTS: Array<{ id: SortId; label: string }> = [
  { id: 'recent', label: 'recent' },
  { id: 'name', label: 'name' },
  { id: 'cost', label: 'cost' }
]

function isRunning(s: SessionMeta): boolean {
  return s.state === 'thinking' || s.state === 'generating'
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function costToday(sessions: SessionMeta[]): number {
  const now = new Date()
  return sessions.reduce((sum, s) => {
    if (!s.cost || s.cost <= 0) return sum
    const created = new Date(s.createdAt)
    if (!isSameDay(created, now)) return sum
    return sum + s.cost
  }, 0)
}

function sortSessions(list: SessionMeta[], sort: SortId): SessionMeta[] {
  const copy = [...list]
  if (sort === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name))
  } else if (sort === 'cost') {
    copy.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
  } else {
    // 'recent' — newest createdAt first
    copy.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return tb - ta
    })
  }
  return copy
}

export default function Dashboard({ open, onClose, mode = 'inline' }: Props) {
  const sessions = useSessions((s) => s.sessions)
  const setActive = useSessions((s) => s.setActive)
  const destroySession = useSessions((s) => s.destroySession)
  const cloneSession = useSessions((s) => s.cloneSession)
  const [showExplainer, setShowExplainer] = useState(false)
  const [filter, setFilter] = useState<FilterId>('all')
  const [sort, setSort] = useState<SortId>('recent')

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
    void window.api.session.restart(id)
  }
  const handleDestroy = (id: string): void => {
    void destroySession(id)
  }
  const handleClone = (id: string): void => {
    void cloneSession(id)
  }
  const handleSpawn = (): void => {
    useSpawnDialog.getState().show()
  }

  const runningCount = useMemo(() => sessions.filter(isRunning).length, [sessions])
  const todayCost = useMemo(() => costToday(sessions), [sessions])

  const counts = useMemo(() => {
    const acc = {} as Record<FilterId, number>
    for (const f of FILTERS) {
      acc[f.id] = sessions.filter(f.matches).length
    }
    return acc
  }, [sessions])

  const visible = useMemo(() => {
    const fn = FILTERS.find((f) => f.id === filter)?.matches ?? (() => true)
    return sortSessions(sessions.filter(fn), sort)
  }, [sessions, filter, sort])

  if (!open) return null

  const headerCounts = (
    <div className="flex items-baseline gap-1.5 font-mono text-[11px] text-text-3">
      <span className="tabular-nums text-text-2">
        {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
      </span>
      <span className="text-text-4">·</span>
      <span className="tabular-nums">
        <span className={runningCount > 0 ? 'text-accent-400' : 'text-text-3'}>
          {runningCount}
        </span>{' '}
        running
      </span>
      <span className="text-text-4">·</span>
      <span className="tabular-nums text-text-3">
        ${todayCost.toFixed(2)} today
      </span>
    </div>
  )

  const chips = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Filter size={11} strokeWidth={1.75} className="text-text-4" />
      {FILTERS.map((f) => {
        const active = filter === f.id
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-sm px-2 py-1 text-[11px] transition-colors ${
              active
                ? 'bg-accent-500/15 text-accent-400'
                : 'bg-bg-3 text-text-2 hover:text-text-1'
            }`}
          >
            {f.label}
            <span
              className={`ml-1 font-mono tabular-nums ${
                active ? 'text-accent-400/80' : 'text-text-4'
              }`}
            >
              {counts[f.id] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )

  const sortSelect = (
    <label className="flex items-center gap-1.5 text-[11px] text-text-3">
      <ArrowUpDown size={11} strokeWidth={1.75} className="text-text-4" />
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortId)}
        className="cursor-pointer rounded-sm bg-bg-3 px-2 py-1 text-[11px] text-text-2 outline-none hover:text-text-1 focus:ring-1 focus:ring-accent-500/40"
        aria-label="sort sessions"
      >
        {SORTS.map((s) => (
          <option key={s.id} value={s.id} className="bg-bg-2 text-text-1">
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )

  const emptyState = (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
      <LayoutDashboard size={44} strokeWidth={1.25} className="text-text-4" />
      <div className="flex flex-col items-center gap-1">
        <div className="text-base font-semibold text-text-1">no sessions yet</div>
        <div className="text-xs text-text-4">
          spawn an agent to start monitoring it here.
        </div>
      </div>
      <button
        type="button"
        onClick={handleSpawn}
        className="flex items-center gap-1.5 rounded-sm bg-accent-500/15 px-3 py-1.5 text-[12px] font-medium text-accent-400 transition-colors hover:bg-accent-500/25"
      >
        <Plus size={13} strokeWidth={2} />
        new session
      </button>
    </div>
  )

  const filteredEmpty = (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
      <LayoutDashboard size={32} strokeWidth={1.25} className="text-text-4" />
      <div className="text-sm text-text-2">no sessions match this filter</div>
      <button
        type="button"
        onClick={() => setFilter('all')}
        className="font-mono text-[11px] text-text-4 hover:text-text-1"
      >
        show all →
      </button>
    </div>
  )

  const grid = (
    <div className="df-scroll grid flex-1 gap-3 overflow-y-auto pr-1 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] [grid-auto-rows:min-content]">
      {visible.map((s) => {
        const realIndex = sessions.findIndex((x) => x.id === s.id)
        return (
          <SessionCard
            key={s.id}
            session={s}
            index={realIndex + 1}
            active={false}
            onClick={() => handleFocus(s.id)}
            onDestroy={() => handleDestroy(s.id)}
            onRestart={() => handleRestart(s.id)}
            onClone={() => handleClone(s.id)}
          />
        )
      })}
    </div>
  )

  const body = (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg-1">
      {/* sticky title strip */}
      <header className="sticky top-0 z-10 flex shrink-0 flex-col gap-2 border-b border-border-soft bg-bg-2 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2 text-sm">
              <LayoutDashboard size={14} strokeWidth={1.75} className="text-accent-400" />
              <span className="font-semibold text-text-1">Dashboard</span>
            </div>
            {headerCounts}
          </div>
          <div className="flex items-center gap-1">
            {sessions.length > 0 ? (
              <button
                type="button"
                onClick={handleSpawn}
                className="flex items-center gap-1 rounded-sm bg-accent-500/15 px-2 py-1 text-[11px] font-medium text-accent-400 hover:bg-accent-500/25"
                title="new session"
              >
                <Plus size={12} strokeWidth={2} />
                new
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowExplainer((v) => !v)}
              className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] text-text-4 hover:bg-bg-3 hover:text-text-1"
              title="what is the dashboard?"
            >
              <Info size={11} strokeWidth={1.75} />
              what?
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
              aria-label="close"
              title="Esc"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* filters + sort row — only meaningful when there are sessions */}
        {sessions.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {chips}
            {sortSelect}
          </div>
        ) : null}
      </header>

      {showExplainer ? (
        <div className="border-b border-border-soft bg-bg-1 px-4 py-3 text-[11px] leading-relaxed text-text-3">
          <p className="mb-1.5">
            <strong className="text-text-2">Dashboard</strong> — overview of every running agent
            at once. Each card shows live state (thinking, generating, awaiting input), model and
            the latest assistant response.
          </p>
          <p>
            Useful when you have several agents running in parallel and want to monitor them at a
            glance without cycling through {fmtShortcut('1')} / {fmtShortcut('2')} /{' '}
            {fmtShortcut('3')}. Click a card to focus that session — the dashboard closes and the
            main terminal switches to it.
          </p>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden p-3">
        {sessions.length === 0 ? emptyState : visible.length === 0 ? filteredEmpty : grid}
      </div>
    </div>
  )

  if (mode === 'inline') return body

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-bg-0/85 p-6 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="df-fade-in mx-auto h-full max-w-[1280px] overflow-hidden rounded-lg border border-border-mid bg-bg-2 shadow-pop">
        {body}
      </div>
    </div>,
    document.body
  )
}
