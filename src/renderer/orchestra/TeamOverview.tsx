/**
 * TeamOverview — a compact bar pinned to the top of the canvas that shows
 * live counters for the active team. Gives the user an at-a-glance answer
 * to "what's happening right now?" without opening the Inspector or the
 * task drawer.
 *
 * Counters:
 *  - Total agents, idle, running, paused, error.
 *  - Active tasks (queued + routing + in_progress + blocked).
 *  - Short list of in-progress tasks with the agent name that owns each.
 *    Clicking an entry opens the TaskDrawer for that task.
 *
 * Absolutely-positioned overlay so the canvas beneath keeps its full
 * hit area — `pointer-events-none` on the wrapper, then re-enabled on
 * each interactive child.
 */

import { Activity, AlertTriangle, Loader2, Pause } from 'lucide-react'
import { useMemo } from 'react'
import { useOrchestra } from './state/orchestra'
import type { Task, AgentState } from '../../shared/orchestra'

export default function TeamOverview() {
  const activeTeamId = useOrchestra((s) => s.activeTeamId)
  const agents = useOrchestra((s) => s.agents)
  const tasks = useOrchestra((s) => s.tasks)
  const setTaskDrawer = useOrchestra((s) => s.setTaskDrawer)

  const { agentStats, activeTasks } = useMemo(() => {
    const teamAgents = agents.filter((a) => a.teamId === activeTeamId)
    const stats: Record<AgentState, number> = {
      idle: 0,
      running: 0,
      paused: 0,
      error: 0
    }
    for (const a of teamAgents) stats[a.state]++

    const active = tasks
      .filter(
        (t) =>
          t.teamId === activeTeamId &&
          (t.status === 'queued' ||
            t.status === 'routing' ||
            t.status === 'in_progress' ||
            t.status === 'blocked')
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).valueOf() -
          new Date(a.updatedAt ?? a.createdAt).valueOf()
      )

    return {
      agentStats: { total: teamAgents.length, ...stats },
      activeTasks: active
    }
  }, [agents, tasks, activeTeamId])

  if (!activeTeamId) return null
  if (agentStats.total === 0 && activeTasks.length === 0) return null

  const agentById = new Map(agents.map((a) => [a.id, a]))

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
      <div className="pointer-events-auto flex max-w-[min(100%,720px)] items-center gap-3 rounded-sm border border-border-soft bg-bg-2/90 px-3 py-1.5 shadow-pop backdrop-blur-md">
        <Stat
          label="agents"
          value={agentStats.total}
          accent="text-text-2"
        />
        {agentStats.running > 0 ? (
          <Stat
            label="running"
            value={agentStats.running}
            icon={<Loader2 size={11} className="animate-spin text-accent-400" strokeWidth={1.75} />}
            accent="text-accent-400"
          />
        ) : null}
        {agentStats.paused > 0 ? (
          <Stat
            label="paused"
            value={agentStats.paused}
            icon={<Pause size={11} className="text-text-3" strokeWidth={1.75} />}
            accent="text-text-2"
          />
        ) : null}
        {agentStats.error > 0 ? (
          <Stat
            label="error"
            value={agentStats.error}
            icon={<AlertTriangle size={11} className="text-red-400" strokeWidth={1.75} />}
            accent="text-red-400"
          />
        ) : null}
        <span className="h-3 w-px bg-border-soft" aria-hidden />
        <Stat
          label="active tasks"
          value={activeTasks.length}
          icon={<Activity size={11} className="text-text-3" strokeWidth={1.75} />}
          accent="text-text-2"
        />

        {activeTasks.length > 0 ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {activeTasks.slice(0, 4).map((t) => (
              <TaskPill
                key={t.id}
                task={t}
                assigneeName={
                  t.assignedAgentId
                    ? (agentById.get(t.assignedAgentId)?.name ?? '?')
                    : 'auto'
                }
                onClick={() => setTaskDrawer(t.id)}
              />
            ))}
            {activeTasks.length > 4 ? (
              <span className="text-[10px] text-text-4">
                +{activeTasks.length - 4}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  accent
}: {
  label: string
  value: number
  icon?: React.ReactNode
  accent: string
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {icon}
      <span className={`font-mono text-[12px] font-semibold ${accent}`}>{value}</span>
      <span className="df-label whitespace-nowrap text-[10px] text-text-4">{label}</span>
    </div>
  )
}

function TaskPill({
  task,
  assigneeName,
  onClick
}: {
  task: Task
  assigneeName: string
  onClick: () => void
}) {
  const pulse =
    task.status === 'in_progress'
      ? 'before:absolute before:-left-0.5 before:top-0 before:h-full before:w-0.5 before:animate-pulse before:bg-accent-500'
      : ''
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden rounded-sm border border-border-soft bg-bg-3 px-1.5 py-0.5 text-[10px] text-text-2 hover:border-border-mid hover:text-text-1 ${pulse}`}
      title={`${task.title} · ${task.status} · ${assigneeName}`}
    >
      <span className="mr-1 font-mono text-[9px] text-text-4">{task.priority}</span>
      <span className="truncate">{task.title}</span>
      <span className="ml-1 text-text-4">· {assigneeName}</span>
    </button>
  )
}
