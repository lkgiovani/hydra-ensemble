import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Clock,
  FileText,
  FolderOpen,
  GitPullRequest,
  LayoutDashboard,
  Network,
  Plus,
  X
} from 'lucide-react'
import { useSessions } from '../state/sessions'
import { useSpawnDialog } from '../state/spawn'
import { useProjects } from '../state/projects'
import { useEditor } from '../state/editor'
import { useSlidePanel } from '../state/panels'
import { useGh } from '../state/gh'
import { useOrchestra } from '../orchestra/state/orchestra'
import type { ChangedFile, SessionMeta, Worktree } from '../../shared/types'
import { fmtShortcut } from '../lib/platform'
import SessionCard from './SessionCard'
import { Kbd } from '../ui'

interface Props {
  open: boolean
  onClose: () => void
  /** 'inline' renders a self-contained pane (no portal/backdrop). */
  mode?: 'inline' | 'overlay'
}

const RECENT_SESSIONS_LIMIT = 6
const RECENT_CHANGES_LIMIT = 5
const CHANGES_POLL_MS = 15_000

interface ChangeEntry {
  worktreePath: string
  file: ChangedFile
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function sessionsCreatedToday(sessions: SessionMeta[]): SessionMeta[] {
  const now = new Date()
  return sessions.filter((s) => isSameDay(new Date(s.createdAt), now))
}

function costToday(sessions: SessionMeta[]): number {
  const today = sessionsCreatedToday(sessions)
  return today.reduce((sum, s) => sum + (s.cost && s.cost > 0 ? s.cost : 0), 0)
}

/** "Time active today" — minutes between the earliest createdAt today and now.
 *  A coarse but honest proxy: it's how long you've been at the keyboard today
 *  in terms of spawned agents. */
function minutesActiveToday(sessions: SessionMeta[]): number {
  const today = sessionsCreatedToday(sessions)
  if (today.length === 0) return 0
  const earliest = today.reduce((min, s) => {
    const t = new Date(s.createdAt).getTime()
    return t < min ? t : min
  }, Number.POSITIVE_INFINITY)
  if (!Number.isFinite(earliest)) return 0
  const floor = Math.max(earliest, startOfDay(new Date()).getTime())
  return Math.max(0, Math.floor((Date.now() - floor) / 60_000))
}

function fmtMinutes(total: number): string {
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

function statusLabel(status: ChangedFile['status']): string {
  switch (status) {
    case 'added':
      return 'A'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'untracked':
      return '?'
    case 'modified':
    default:
      return 'M'
  }
}

function statusTone(status: ChangedFile['status']): string {
  switch (status) {
    case 'added':
      return 'text-status-generating'
    case 'deleted':
      return 'text-status-attention'
    case 'renamed':
      return 'text-status-input'
    case 'untracked':
      return 'text-text-4'
    case 'modified':
    default:
      return 'text-accent-400'
  }
}

export default function Dashboard({ open, onClose, mode = 'inline' }: Props) {
  const sessions = useSessions((s) => s.sessions)
  const setActive = useSessions((s) => s.setActive)
  const destroySession = useSessions((s) => s.destroySession)
  const cloneSession = useSessions((s) => s.cloneSession)

  const currentProject = useProjects((s) =>
    s.projects.find((p) => p.path === s.currentPath) ?? null
  )
  const worktrees = useProjects((s) => s.worktrees)

  const openEditor = useEditor((s) => s.openEditor)
  const setOverrideRoot = useEditor((s) => s.setOverrideRoot)
  const openSlide = useSlidePanel((s) => s.open)

  const orchestraEnabled = useOrchestra((s) => s.settings.enabled)
  const setOrchestraSettings = useOrchestra((s) => s.setSettings)
  const setOrchestraOpen = useOrchestra((s) => s.setOverlayOpen)

  const ghPrs = useGh((s) => s.prs)

  const [changes, setChanges] = useState<ChangeEntry[]>([])
  // Re-tick so the stats bar refreshes "time active" without a prop change.
  const [, setTickNow] = useState(0)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Keep the hero stats (time active today) refreshed while the dashboard is
  // mounted. 30s is fine — the number is in minutes.
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setTickNow((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [open])

  // Poll recent changes across all project worktrees, merge, sort.
  useEffect(() => {
    if (!open) return
    const paths = worktrees.map((w) => w.path)
    if (paths.length === 0) {
      setChanges([])
      return
    }

    let cancelled = false
    const load = async (): Promise<void> => {
      const results = await Promise.all(
        paths.map(async (p) => {
          const res = await window.api.git.listChangedFiles(p)
          if (!res.ok) return [] as ChangeEntry[]
          return res.value.map((f) => ({ worktreePath: p, file: f }))
        })
      )
      if (cancelled) return
      const flat = results.flat()
      // Stable-ish ordering: unstaged first (user's live edits), then by path
      // for determinism. We don't have mtime from porcelain, so this is the
      // best "most relevant first" signal we have.
      flat.sort((a, b) => {
        const aStaged = a.file.staged ? 1 : 0
        const bStaged = b.file.staged ? 1 : 0
        if (aStaged !== bStaged) return aStaged - bStaged
        return a.file.path.localeCompare(b.file.path)
      })
      setChanges(flat)
    }

    void load()
    const id = window.setInterval(() => void load(), CHANGES_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, worktrees])

  const todaySessions = useMemo(() => sessionsCreatedToday(sessions), [sessions])
  const todayCost = useMemo(() => costToday(sessions), [sessions])
  const activeMinutes = useMemo(() => minutesActiveToday(sessions), [sessions])

  const recentSessions = useMemo(() => {
    const copy = [...sessions]
    copy.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return tb - ta
    })
    return copy.slice(0, RECENT_SESSIONS_LIMIT)
  }, [sessions])

  const worktreeAgentCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) {
      const key = s.worktreePath ?? s.cwd
      if (!key) continue
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [sessions])

  const recentChanges = useMemo(
    () => changes.slice(0, RECENT_CHANGES_LIMIT),
    [changes]
  )

  const openPRs = useMemo(
    () => ghPrs.filter((p) => p.state === 'OPEN').slice(0, 6),
    [ghPrs]
  )

  const todayLabel = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    })
  }, [])

  if (!open) return null

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

  const handleOpenWorktree = (path?: string): void => {
    const target = path ?? currentProject?.path ?? null
    if (target) setOverrideRoot(target)
    openEditor()
    openSlide('editor')
    onClose()
  }

  const handleOpenOrchestra = (): void => {
    if (!orchestraEnabled) {
      void setOrchestraSettings({ enabled: true })
    }
    setOrchestraOpen(true)
    onClose()
  }

  const hero = (
    <section className="flex shrink-0 flex-col gap-2 border-b border-border-soft bg-bg-2 px-6 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <LayoutDashboard
              size={16}
              strokeWidth={1.75}
              className="text-accent-400"
            />
            <span className="text-[11px] uppercase tracking-wider text-text-4">
              Dashboard
            </span>
          </div>
          <h1 className="truncate text-2xl font-semibold text-text-1">
            {currentProject?.name ?? 'Workspace'}
          </h1>
          <div className="text-[11px] text-text-4">{todayLabel}</div>
        </div>
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
      <div className="mt-2 grid grid-cols-3 gap-3">
        <Stat
          label="sessions today"
          value={todaySessions.length.toString()}
          accent
        />
        <Stat label="time active" value={fmtMinutes(activeMinutes)} />
        <Stat label="cost today" value={`$${todayCost.toFixed(2)}`} />
      </div>
    </section>
  )

  const primaryActions = (
    <section className="grid shrink-0 grid-cols-1 gap-3 px-6 py-5 md:grid-cols-3">
      <ActionButton
        primary
        icon={<Plus size={18} strokeWidth={2} />}
        title="New session"
        subtitle="spawn an agent"
        onClick={handleSpawn}
      />
      <ActionButton
        icon={<FolderOpen size={18} strokeWidth={1.75} />}
        title="Open Worktree"
        subtitle={
          currentProject
            ? `${currentProject.name} in editor`
            : 'open editor on project'
        }
        onClick={() => handleOpenWorktree()}
        disabled={!currentProject}
      />
      <ActionButton
        icon={<Network size={18} strokeWidth={1.75} />}
        title={orchestraEnabled ? 'Open Orchestra' : 'Enable Orchestra'}
        subtitle={
          orchestraEnabled
            ? 'headless agent teams'
            : 'experimental — click to turn on'
        }
        onClick={handleOpenOrchestra}
      />
    </section>
  )

  const recentSessionsSection = (
    <Section
      title="Recent sessions"
      hint={
        sessions.length > RECENT_SESSIONS_LIMIT
          ? `showing ${RECENT_SESSIONS_LIMIT} of ${sessions.length}`
          : undefined
      }
    >
      {recentSessions.length === 0 ? (
        <EmptyRow
          icon={<LayoutDashboard size={18} strokeWidth={1.5} />}
          label="no sessions yet"
          action={
            <button
              type="button"
              onClick={handleSpawn}
              className="flex items-center gap-1 rounded-sm bg-accent-500/15 px-2 py-1 text-[11px] font-medium text-accent-400 hover:bg-accent-500/25"
            >
              <Plus size={12} strokeWidth={2} />
              new session
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] [grid-auto-rows:min-content]">
          {recentSessions.map((s) => {
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
      )}
    </Section>
  )

  const worktreesSection = (
    <Section title="Worktrees" hint={`${worktrees.length} on this project`}>
      {worktrees.length === 0 ? (
        <EmptyRow
          icon={<FolderOpen size={18} strokeWidth={1.5} />}
          label="no worktrees yet"
        />
      ) : (
        <div className="df-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {worktrees.map((w) => (
            <WorktreeCard
              key={w.path}
              worktree={w}
              agentCount={worktreeAgentCounts[w.path] ?? 0}
              onOpen={() => handleOpenWorktree(w.path)}
            />
          ))}
        </div>
      )}
    </Section>
  )

  const recentChangesSection = (
    <Section
      title="Recent changes"
      icon={<FileText size={13} strokeWidth={1.75} className="text-text-4" />}
      hint={
        changes.length > RECENT_CHANGES_LIMIT
          ? `${changes.length} total`
          : undefined
      }
    >
      {recentChanges.length === 0 ? (
        <EmptyRow
          icon={<FileText size={18} strokeWidth={1.5} />}
          label="working tree is clean"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft rounded-sm border border-border-soft bg-bg-2">
          {recentChanges.map((c, i) => (
            <li
              key={`${c.worktreePath}:${c.file.path}:${i}`}
              className="flex items-center gap-3 px-3 py-2 text-[12px]"
            >
              <span
                className={`w-3 shrink-0 font-mono text-[11px] ${statusTone(c.file.status)}`}
              >
                {statusLabel(c.file.status)}
              </span>
              <span className="min-w-0 flex-1 truncate text-text-1">
                {c.file.path}
              </span>
              <span className="truncate font-mono text-[10px] text-text-4">
                {basename(c.worktreePath)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )

  const openPRsSection = (
    <Section
      title="Open PRs"
      icon={
        <GitPullRequest size={13} strokeWidth={1.75} className="text-text-4" />
      }
      hint={openPRs.length > 0 ? `${openPRs.length}` : undefined}
    >
      {openPRs.length === 0 ? (
        <EmptyRow
          icon={<GitPullRequest size={18} strokeWidth={1.5} />}
          label="no cached PRs — open the PR panel to refresh"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft rounded-sm border border-border-soft bg-bg-2">
          {openPRs.map((pr) => (
            <li
              key={pr.number}
              className="flex items-center gap-3 px-3 py-2 text-[12px]"
            >
              <span className="w-10 shrink-0 font-mono text-[11px] text-text-4">
                #{pr.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-text-1">
                {pr.title}
              </span>
              {pr.isDraft ? (
                <span className="shrink-0 rounded-sm bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-text-3">
                  draft
                </span>
              ) : null}
              <span className="hidden shrink-0 truncate font-mono text-[10px] text-text-4 md:inline">
                {pr.headRefName}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-text-4">
                @{pr.author}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )

  const footer = (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border-soft bg-bg-2 px-6 py-3 text-[11px] text-text-4">
      <div className="flex items-center gap-2">
        <Clock size={11} strokeWidth={1.75} />
        <span>press <Kbd>{fmtShortcut('K')}</Kbd> for the command palette</span>
      </div>
      <div>
        new here? try the <Kbd>tour</Kbd> button in the top-right.
      </div>
    </footer>
  )

  const body = (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg-1">
      <div className="df-scroll flex flex-1 flex-col overflow-y-auto">
        {hero}
        {primaryActions}
        <div className="flex flex-col gap-6 px-6 pb-6">
          {recentSessionsSection}
          {worktreesSection}
          {recentChangesSection}
          {openPRsSection}
        </div>
      </div>
      {footer}
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

// ---------------------------------------------------------------------------
// Local presentational helpers
// ---------------------------------------------------------------------------

interface StatProps {
  label: string
  value: string
  accent?: boolean
}

function Stat({ label, value, accent }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-border-soft bg-bg-1/50 px-3 py-2">
      <span
        className={`font-mono text-lg tabular-nums ${
          accent ? 'text-accent-400' : 'text-text-1'
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-text-4">
        {label}
      </span>
    </div>
  )
}

interface ActionButtonProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}

function ActionButton({
  icon,
  title,
  subtitle,
  onClick,
  primary,
  disabled
}: ActionButtonProps) {
  const base =
    'flex items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const style = primary
    ? 'border-accent-500/40 bg-accent-500/10 text-accent-400 hover:bg-accent-500/20'
    : 'border-border-soft bg-bg-2 text-text-1 hover:border-border-mid hover:bg-bg-3'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${style}`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-sm ${
          primary ? 'bg-accent-500/20 text-accent-400' : 'bg-bg-3 text-text-2'
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span
          className={`truncate text-[11px] ${
            primary ? 'text-accent-400/70' : 'text-text-4'
          }`}
        >
          {subtitle}
        </span>
      </span>
    </button>
  )
}

interface SectionProps {
  title: string
  icon?: React.ReactNode
  hint?: string
  children: React.ReactNode
}

function Section({ title, icon, hint, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-text-2">
            {title}
          </h2>
        </div>
        {hint ? (
          <span className="font-mono text-[10px] text-text-4">{hint}</span>
        ) : null}
      </header>
      {children}
    </section>
  )
}

interface EmptyRowProps {
  icon: React.ReactNode
  label: string
  action?: React.ReactNode
}

function EmptyRow({ icon, label, action }: EmptyRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-dashed border-border-soft bg-bg-2/40 px-3 py-4 text-[12px] text-text-4">
      <span className="text-text-4">{icon}</span>
      <span className="flex-1">{label}</span>
      {action}
    </div>
  )
}

interface WorktreeCardProps {
  worktree: Worktree
  agentCount: number
  onOpen: () => void
}

function WorktreeCard({ worktree, agentCount, onOpen }: WorktreeCardProps) {
  const name = basename(worktree.path)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-56 shrink-0 flex-col gap-1 rounded-sm border border-border-soft bg-bg-2 px-3 py-2 text-left transition-colors hover:border-border-mid hover:bg-bg-3"
      title={worktree.path}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-text-1">
          {name}
        </span>
        {worktree.isMain ? (
          <span className="shrink-0 rounded-sm bg-accent-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent-400">
            main
          </span>
        ) : null}
      </div>
      <div className="truncate font-mono text-[10px] text-text-4">
        {worktree.branch || worktree.head.slice(0, 7)}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-4">
        <span>
          <span className="tabular-nums text-text-2">{agentCount}</span>{' '}
          {agentCount === 1 ? 'agent' : 'agents'}
        </span>
        <span className="text-text-4">open →</span>
      </div>
    </button>
  )
}
