/**
 * TeamHealthPanel — at-a-glance team metrics overlay.
 *
 * Opens as a centred modal over the canvas (not a replacement for it) — the
 * user dismisses and returns to the Orchestra canvas underneath. Everything
 * is derived from the live store, so numbers tick as IPC events stream in.
 *
 * Sections, in order: Header, KPIs (grid-4), Throughput (12h hourly bars),
 * Agent roster, Delegation map, Budget (full BudgetMeter). Zero chart libs.
 */
import { useEffect, useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Users,
  X
} from 'lucide-react'
import type {
  Agent,
  AgentState,
  Task,
  TaskStatus
} from '../../shared/orchestra'
import { useOrchestra } from './state/orchestra'
import BudgetMeter from './BudgetMeter'

interface Props {
  open: boolean
  onClose: () => void
}

/** Active-task buckets per the PRD vocabulary. `done` and `failed` are
 *  terminal and surfaced separately; everything else counts toward the
 *  "in-flight" KPI. */
const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'queued',
  'routing',
  'in_progress',
  'blocked'
])

const STATE_PILL: Record<AgentState, string> = {
  idle: 'border-border-soft bg-bg-3 text-text-3',
  running: 'border-sky-500/50 bg-sky-500/15 text-sky-300',
  paused: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
  error: 'border-red-500/60 bg-red-500/15 text-red-300'
}

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const THROUGHPUT_BUCKETS = 12

export default function TeamHealthPanel({ open, onClose }: Props) {
  const activeTeamId = useOrchestra((s) => s.activeTeamId)
  const teams = useOrchestra((s) => s.teams)
  const agents = useOrchestra((s) => s.agents)
  const tasks = useOrchestra((s) => s.tasks)
  const routes = useOrchestra((s) => s.routes)

  const team = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? null,
    [teams, activeTeamId]
  )

  const teamAgents = useMemo<Agent[]>(
    () => (activeTeamId ? agents.filter((a) => a.teamId === activeTeamId) : []),
    [agents, activeTeamId]
  )

  const teamTasks = useMemo<Task[]>(
    () => (activeTeamId ? tasks.filter((t) => t.teamId === activeTeamId) : []),
    [tasks, activeTeamId]
  )

  // Esc closes. Scoped to `open` so listeners don't leak while hidden.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ---- KPIs ---------------------------------------------------------------

  const kpis = useMemo(() => {
    const now = Date.now()
    const last24 = now - DAY_MS
    let running = 0
    let idle = 0
    let error = 0
    for (const a of teamAgents) {
      if (a.state === 'running') running += 1
      else if (a.state === 'idle') idle += 1
      else if (a.state === 'error') error += 1
    }
    let active = 0
    let done24 = 0
    let failed24 = 0
    for (const t of teamTasks) {
      if (ACTIVE_STATUSES.has(t.status)) active += 1
      const finishedIso = t.finishedAt ?? t.updatedAt
      const finishedAt = finishedIso ? new Date(finishedIso).getTime() : NaN
      if (!Number.isNaN(finishedAt) && finishedAt >= last24) {
        if (t.status === 'done') done24 += 1
        else if (t.status === 'failed') failed24 += 1
      }
    }
    return {
      activeAgents: running + idle,
      running,
      idle,
      hasError: error > 0,
      errorCount: error,
      activeTasks: active,
      done24,
      failed24
    }
  }, [teamAgents, teamTasks])

  // ---- Throughput --------------------------------------------------------

  const throughput = useMemo(() => {
    // Anchor buckets to the top of the current hour so the rightmost bar
    // is always "this hour" — sliding window would make the axis lie.
    const now = Date.now()
    const anchor = Math.floor(now / HOUR_MS) * HOUR_MS
    const buckets = new Array<number>(THROUGHPUT_BUCKETS).fill(0)
    for (const t of teamTasks) {
      if (t.status !== 'done') continue
      const finishedIso = t.finishedAt ?? t.updatedAt
      const finishedAt = finishedIso ? new Date(finishedIso).getTime() : NaN
      if (Number.isNaN(finishedAt)) continue
      // Bucket 0 = oldest (11h ago), bucket 11 = current hour.
      const offset = Math.floor((anchor - finishedAt) / HOUR_MS)
      if (offset < 0) {
        const last = THROUGHPUT_BUCKETS - 1
        buckets[last] = (buckets[last] ?? 0) + 1
        continue
      }
      if (offset >= THROUGHPUT_BUCKETS) continue
      const idx = THROUGHPUT_BUCKETS - 1 - offset
      buckets[idx] = (buckets[idx] ?? 0) + 1
    }
    const max = buckets.reduce((m, v) => (v > m ? v : m), 0)
    const total = buckets.reduce((s, v) => s + v, 0)
    return { buckets, max, total }
  }, [teamTasks])

  // ---- Agent roster: current task + done count per agent -----------------

  const rosterMeta = useMemo(() => {
    const currentByAgent = new Map<string, Task>()
    const doneCountByAgent = new Map<string, number>()
    for (const t of teamTasks) {
      if (!t.assignedAgentId) continue
      if (t.status === 'in_progress') {
        // Prefer most recently updated in-progress task if an agent somehow
        // has multiple rows (shouldn't happen, but keeps the UI honest).
        const prev = currentByAgent.get(t.assignedAgentId)
        if (!prev || prev.updatedAt < t.updatedAt) {
          currentByAgent.set(t.assignedAgentId, t)
        }
      }
      if (t.status === 'done') {
        doneCountByAgent.set(
          t.assignedAgentId,
          (doneCountByAgent.get(t.assignedAgentId) ?? 0) + 1
        )
      }
    }
    return { currentByAgent, doneCountByAgent }
  }, [teamTasks])

  // ---- Delegation map ----------------------------------------------------

  const delegation = useMemo(() => {
    // Routes don't carry teamId — narrow via the task slice we already
    // filtered to the active team.
    const teamTaskIds = new Set(teamTasks.map((t) => t.id))
    const agentName = new Map<string, string>()
    for (const a of teamAgents) agentName.set(a.id, a.name)

    const delegatorCount = new Map<string, number>()
    const delegateeCount = new Map<string, number>()

    for (const r of routes) {
      if (!teamTaskIds.has(r.taskId)) continue
      if (!r.reason.startsWith('delegation:')) continue
      // Reason format emitted by the router: `delegation: <parent> -> <child>`
      // or similar. Parse defensively — if format drifts we still count the
      // chosen agent as the delegatee so the right-hand column isn't empty.
      const afterColon = r.reason.slice('delegation:'.length).trim()
      const arrowIdx = afterColon.indexOf('->')
      let fromName = ''
      if (arrowIdx !== -1) {
        fromName = afterColon.slice(0, arrowIdx).trim()
      }
      if (fromName.length > 0) {
        delegatorCount.set(
          fromName,
          (delegatorCount.get(fromName) ?? 0) + 1
        )
      }
      const toName = agentName.get(r.chosenAgentId) ?? r.chosenAgentId
      delegateeCount.set(toName, (delegateeCount.get(toName) ?? 0) + 1)
    }

    const pickTop = (m: Map<string, number>): { name: string; count: number } | null => {
      let bestName = ''
      let bestCount = 0
      for (const [name, count] of m) {
        if (count > bestCount) {
          bestName = name
          bestCount = count
        }
      }
      return bestCount === 0 ? null : { name: bestName, count: bestCount }
    }

    return {
      topDelegator: pickTop(delegatorCount),
      topDelegatee: pickTop(delegateeCount),
      total: Array.from(delegateeCount.values()).reduce((s, v) => s + v, 0)
    }
  }, [routes, teamTasks, teamAgents])

  if (!open) return null

  return (
    <div
      className="df-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-bg-0/85 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="team health"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{ borderRadius: 'var(--radius-lg)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border-soft bg-bg-1 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Activity
              size={14}
              strokeWidth={2}
              className="text-accent-500"
              aria-hidden
            />
            <span className="df-label">team health</span>
            <span className="text-text-4" aria-hidden>
              ·
            </span>
            <span
              className="truncate font-mono text-[12px] text-text-1"
              title={team?.name ?? ''}
            >
              {team?.name ?? 'no team selected'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="close"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </header>

        {/* Body */}
        <div className="df-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!activeTeamId ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="font-mono text-[12px] text-text-2">
                No team selected
              </span>
              <span className="font-mono text-[11px] text-text-4">
                Pick a team from the rail to see its health snapshot.
              </span>
            </div>
          ) : (
            <>
              {/* KPIs — 4 cards */}
              <section
                aria-label="key metrics"
                className="grid grid-cols-4 gap-2"
              >
                <KpiCard
                  icon={<Users size={12} strokeWidth={2} aria-hidden />}
                  label="active agents"
                  value={kpis.activeAgents}
                  sub={`${kpis.running} running · ${kpis.idle} idle`}
                  ring={kpis.hasError ? 'danger' : 'neutral'}
                  trailing={
                    kpis.hasError ? (
                      <span className="font-mono text-[10px] text-red-300">
                        {kpis.errorCount} in error
                      </span>
                    ) : null
                  }
                />
                <KpiCard
                  icon={<Activity size={12} strokeWidth={2} aria-hidden />}
                  label="active tasks"
                  value={kpis.activeTasks}
                  sub="queued · routing · in progress · blocked"
                  ring="neutral"
                />
                <KpiCard
                  icon={
                    <CheckCircle2 size={12} strokeWidth={2} aria-hidden />
                  }
                  label="tasks completed"
                  value={kpis.done24}
                  sub="last 24h"
                  ring="neutral"
                  valueTone="text-status-generating"
                />
                <KpiCard
                  icon={
                    <AlertTriangle size={12} strokeWidth={2} aria-hidden />
                  }
                  label="tasks failed"
                  value={kpis.failed24}
                  sub="last 24h"
                  ring={kpis.failed24 > 0 ? 'danger' : 'neutral'}
                  valueTone={
                    kpis.failed24 > 0
                      ? 'text-red-300'
                      : 'text-text-2'
                  }
                />
              </section>

              {/* Throughput */}
              <section
                aria-label="throughput"
                className="flex flex-col gap-2 rounded-sm border border-border-soft bg-bg-1 p-3"
              >
                <header className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp
                      size={12}
                      strokeWidth={2}
                      className="text-text-3"
                      aria-hidden
                    />
                    <span className="df-label">throughput</span>
                    <span className="font-mono text-[10px] text-text-4">
                      tasks completed · last 12h
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-text-4">
                    total {throughput.total}
                  </span>
                </header>
                <ThroughputBars
                  buckets={throughput.buckets}
                  max={throughput.max}
                />
              </section>

              {/* Agent roster + Delegation map side by side */}
              <div className="grid grid-cols-3 gap-3">
                {/* Roster — spans 2 cols */}
                <section
                  aria-label="agent roster"
                  className="col-span-2 flex flex-col gap-2 rounded-sm border border-border-soft bg-bg-1 p-3"
                >
                  <header className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Users
                        size={12}
                        strokeWidth={2}
                        className="text-text-3"
                        aria-hidden
                      />
                      <span className="df-label">agent roster</span>
                    </div>
                    <span className="font-mono text-[10px] text-text-4">
                      {teamAgents.length}{' '}
                      {teamAgents.length === 1 ? 'agent' : 'agents'}
                    </span>
                  </header>

                  {teamAgents.length === 0 ? (
                    <span className="py-4 text-center font-mono text-[11px] text-text-4">
                      No agents yet.
                    </span>
                  ) : (
                    <ul className="flex flex-col">
                      {teamAgents.map((agent) => (
                        <li key={agent.id}>
                          <RosterRow
                            agent={agent}
                            currentTitle={
                              rosterMeta.currentByAgent.get(agent.id)?.title ??
                              null
                            }
                            done={
                              rosterMeta.doneCountByAgent.get(agent.id) ?? 0
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Delegation + Budget stacked */}
                <div className="flex flex-col gap-3">
                  <section
                    aria-label="delegation map"
                    className="flex flex-col gap-2 rounded-sm border border-border-soft bg-bg-1 p-3"
                  >
                    <header className="flex items-center justify-between">
                      <span className="df-label">delegation map</span>
                      <span className="font-mono text-[10px] text-text-4">
                        {delegation.total}{' '}
                        {delegation.total === 1
                          ? 'delegation'
                          : 'delegations'}
                      </span>
                    </header>
                    <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-text-4">
                          top delegator
                        </span>
                        {delegation.topDelegator ? (
                          <span className="text-text-1">
                            {delegation.topDelegator.name}{' '}
                            <span className="text-text-4">
                              ({delegation.topDelegator.count}{' '}
                              {delegation.topDelegator.count === 1
                                ? 'delegation'
                                : 'delegations'}
                              )
                            </span>
                          </span>
                        ) : (
                          <span className="text-text-4">—</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-text-4">
                          most-delegated-to
                        </span>
                        {delegation.topDelegatee ? (
                          <span className="text-text-1">
                            {delegation.topDelegatee.name}{' '}
                            <span className="text-text-4">
                              ({delegation.topDelegatee.count} received)
                            </span>
                          </span>
                        ) : (
                          <span className="text-text-4">—</span>
                        )}
                      </div>
                    </div>
                  </section>

                  <section
                    aria-label="budget"
                    className="flex flex-col gap-2 rounded-sm border border-border-soft bg-bg-1 p-3"
                  >
                    <header className="flex items-center justify-between">
                      <span className="df-label">budget</span>
                    </header>
                    <BudgetMeter teamId={activeTeamId} />
                  </section>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer — single dismiss action keeps the grammar of other modals */}
        <footer className="flex items-center justify-end border-t border-border-soft bg-bg-1 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border-soft px-2.5 py-1 text-[11px] text-text-2 hover:border-border-mid hover:bg-bg-3"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: number
  sub: string
  ring: 'neutral' | 'danger'
  valueTone?: string
  trailing?: React.ReactNode
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  ring,
  valueTone,
  trailing
}: KpiCardProps) {
  const ringCls =
    ring === 'danger'
      ? 'border-red-500/60 ring-1 ring-red-500/30'
      : 'border-border-soft'
  return (
    <div
      className={`flex flex-col gap-1 rounded-sm border ${ringCls} bg-bg-1 p-3`}
    >
      <div className="flex items-center gap-1.5 text-text-3">
        {icon}
        <span className="df-label text-[10px] uppercase tracking-wide text-text-4">
          {label}
        </span>
      </div>
      <div
        className={`font-mono text-[22px] font-semibold leading-none ${
          valueTone ?? 'text-text-1'
        }`}
      >
        {value}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-text-4">{sub}</span>
        {trailing}
      </div>
    </div>
  )
}

interface ThroughputBarsProps {
  buckets: number[]
  max: number
}

/** 12 fixed columns of width-% bars. Zero buckets still render a faint
 *  track so the axis doesn't collapse visually when throughput is low. */
function ThroughputBars({ buckets, max }: ThroughputBarsProps) {
  // Guard against divide-by-zero — max=0 means all buckets render as empty
  // tracks at 4% min height, preserving the axis.
  const denom = max === 0 ? 1 : max
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-20 items-end gap-1">
        {buckets.map((count, i) => {
          const pct = Math.max(4, Math.round((count / denom) * 100))
          const bgCls =
            count === 0
              ? 'bg-bg-3'
              : count === max
                ? 'bg-accent-500'
                : 'bg-accent-500/60'
          return (
            <div
              key={i}
              className="flex flex-1 items-end"
              title={`${count} completed ${THROUGHPUT_BUCKETS - 1 - i}h ago`}
            >
              <div
                className={`w-full rounded-sm ${bgCls} transition-all`}
                style={{ height: `${pct}%` }}
                aria-hidden
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] text-text-4">
        <span>-11h</span>
        <span>-6h</span>
        <span>now</span>
      </div>
    </div>
  )
}

interface RosterRowProps {
  agent: Agent
  currentTitle: string | null
  done: number
}

function RosterRow({ agent, currentTitle, done }: RosterRowProps) {
  const pillCls = STATE_PILL[agent.state]
  const dotColor = agent.color ?? 'var(--color-accent-500)'
  return (
    <div className="flex min-h-12 items-center gap-2 border-b border-border-soft py-2 last:border-b-0">
      <span
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="truncate text-[12px] text-text-1"
            title={agent.name}
          >
            {agent.name}
          </span>
          {agent.role ? (
            <>
              <span className="text-text-4" aria-hidden>
                ·
              </span>
              <span
                className="truncate font-mono text-[10px] text-text-3"
                title={agent.role}
              >
                {agent.role}
              </span>
            </>
          ) : null}
        </div>
        {currentTitle ? (
          <span
            className="truncate font-mono text-[10px] text-text-4"
            title={currentTitle}
          >
            on: {currentTitle}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-text-4">idle</span>
        )}
      </div>
      <span
        className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${pillCls}`}
      >
        {agent.state}
      </span>
      <span
        className="shrink-0 font-mono text-[10px] text-text-4"
        title="tasks completed by this agent"
      >
        {done} done
      </span>
    </div>
  )
}
