/**
 * TaskKanban — board-style view of the active team's tasks.
 *
 * Four vertical columns (Queued / In progress / Done / Failed). V1 is
 * strictly read-only: clicking a card opens the shared TaskDrawer via
 * `setTaskDrawer`. Drag-to-reassign across columns is out of scope; the
 * cards are plain clickable surfaces so we can swap in a dnd lib later
 * without disturbing the store contract.
 *
 * Data source: `useOrchestra` — tasks filtered by `activeTeamId`, agent
 * lookup for the assignee dot, no IPC, no new actions.
 */
import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { CheckCircle2, Inbox, Loader2, XCircle } from 'lucide-react'
import type { Agent, Priority, Task, TaskStatus, UUID } from '../../shared/orchestra'
import { defaultAgentColor } from '../lib/agent'
import { useOrchestra } from './state/orchestra'

/** One column's definition — declarative so the render loop stays flat
 *  and adding a future column (e.g. "review") is a one-line change. */
interface ColumnDef {
  key: 'queued' | 'in_progress' | 'done' | 'failed'
  label: string
  /** Statuses funnelled into this column. Kept as an array so `queued`
   *  and `routing` can share the same surface without forcing routing to
   *  render a second card. */
  statuses: ReadonlyArray<TaskStatus>
  /** Accent colour for the top stripe — uses app tokens where available
   *  and falls back to palette hues for states that have no dedicated
   *  semantic token (e.g. "done" uses emerald). */
  accent: string
  Icon: typeof Inbox
}

const COLUMNS: ReadonlyArray<ColumnDef> = [
  {
    key: 'queued',
    label: 'Queued',
    statuses: ['queued', 'routing'],
    accent: 'bg-text-4',
    Icon: Inbox
  },
  {
    key: 'in_progress',
    label: 'In progress',
    statuses: ['in_progress', 'blocked'],
    accent: 'bg-accent-500',
    Icon: Loader2
  },
  {
    key: 'done',
    label: 'Done',
    statuses: ['done'],
    accent: 'bg-emerald-500',
    Icon: CheckCircle2
  },
  {
    key: 'failed',
    label: 'Failed',
    statuses: ['failed'],
    accent: 'bg-red-500',
    Icon: XCircle
  }
]

/** Priority pill palette — mirrors TaskRow.tsx so both surfaces agree at a
 *  glance. Duplicated deliberately to keep TaskRow presentational without
 *  promoting the palette to a shared module prematurely. */
const PRIORITY_PILL: Record<Priority, string> = {
  P0: 'border-red-500/60 bg-red-500/15 text-red-300',
  P1: 'border-amber-500/60 bg-amber-500/15 text-amber-300',
  P2: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
  P3: 'border-border-mid bg-bg-3 text-text-3'
}

/** Relative time in compact units — identical output to TaskRow's helper
 *  so tooltips and meta rows read the same across views. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - then) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d`
  return new Date(iso).toLocaleDateString()
}

export default function TaskKanban() {
  const activeTeamId = useOrchestra((s) => s.activeTeamId)
  const tasks = useOrchestra((s) => s.tasks)
  const agents = useOrchestra((s) => s.agents)
  const setTaskDrawer = useOrchestra((s) => s.setTaskDrawer)

  // Tasks for the active team, newest-first. Memoised so the filter per
  // column below walks a stable array; Zustand returns a new reference on
  // every `tasks` write and we want stable props for the column bodies.
  const teamTasks = useMemo<Task[]>(() => {
    if (!activeTeamId) return []
    return tasks
      .filter((t) => t.teamId === activeTeamId)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [tasks, activeTeamId])

  // Bucket tasks once per teamTasks change — O(n) partition instead of
  // four O(n) filters. The object keys line up 1:1 with COLUMNS[].key so
  // the render loop can trust the lookup without default-value guards.
  const grouped = useMemo<Record<ColumnDef['key'], Task[]>>(() => {
    const buckets: Record<ColumnDef['key'], Task[]> = {
      queued: [],
      in_progress: [],
      done: [],
      failed: []
    }
    for (const t of teamTasks) {
      for (const col of COLUMNS) {
        if (col.statuses.includes(t.status)) {
          buckets[col.key].push(t)
          break
        }
      }
    }
    return buckets
  }, [teamTasks])

  // O(1) agent lookup for the avatar dot + assignee name. Kept as a Map
  // rather than a plain object so UUID keys with unusual shapes (e.g.
  // leading digits) don't trip prototype-pollution defences.
  const agentById = useMemo<Map<UUID, Agent>>(() => {
    const map = new Map<UUID, Agent>()
    for (const a of agents) map.set(a.id, a)
    return map
  }, [agents])

  return (
    <div
      data-coach="task-kanban"
      className="grid h-full w-full grid-cols-1 gap-3 overflow-hidden bg-bg-1 p-3 text-text-1 md:grid-cols-2 xl:grid-cols-4"
    >
      {COLUMNS.map((col) => (
        <KanbanColumn
          key={col.key}
          def={col}
          tasks={grouped[col.key]}
          agentById={agentById}
          onOpen={(id) => setTaskDrawer(id)}
        />
      ))}
    </div>
  )
}

interface KanbanColumnProps {
  def: ColumnDef
  tasks: Task[]
  agentById: Map<UUID, Agent>
  onOpen: (taskId: UUID) => void
}

function KanbanColumn({ def, tasks, agentById, onOpen }: KanbanColumnProps) {
  const { Icon } = def
  // The in-progress spinner should feel alive even when no task is in the
  // column, to hint at the column's purpose. The other icons are static.
  const iconAnimated = def.key === 'in_progress'

  return (
    <section
      aria-label={`${def.label} column`}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-border-soft bg-bg-2"
    >
      {/* Accent stripe — sits flush above the sticky header so the column
          reads as a single capped surface even while scrolling. */}
      <div className={`h-0.5 w-full ${def.accent}`} aria-hidden />

      <div className="df-scroll min-h-0 flex-1 overflow-y-auto">
        {/* Sticky header inside the scroll container so the column label
            and count stay visible while the body scrolls. `bg-bg-2` keeps
            it opaque over the cards beneath. */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-bg-2 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Icon
              size={12}
              strokeWidth={2}
              className={`text-text-3 ${iconAnimated ? 'animate-spin' : ''}`}
            />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-2">
              {def.label}
            </span>
          </div>
          <span
            className="rounded-sm border border-border-soft bg-bg-1 px-1.5 py-[1px] font-mono text-[10px] text-text-3"
            aria-label={`${tasks.length} tasks`}
          >
            {tasks.length}
          </span>
        </header>

        {tasks.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center px-3 py-6">
            <span className="font-mono text-[10px] text-text-4">No tasks</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            {tasks.map((t) => (
              <li key={t.id}>
                <KanbanCard
                  task={t}
                  agent={t.assignedAgentId ? agentById.get(t.assignedAgentId) ?? null : null}
                  onClick={() => onOpen(t.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

interface KanbanCardProps {
  task: Task
  /** Resolved agent for the avatar dot. `null` when the task is
   *  unassigned (auto-routing pending or terminal without an owner). */
  agent: Agent | null
  onClick: () => void
}

function KanbanCard({ task, agent, onClick }: KanbanCardProps) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  // Clamp to three tags — the card is denser than TaskRow but still needs
  // to cap a pathological 20-tag task from blowing the layout.
  const visibleTags = task.tags.slice(0, 3)
  const hiddenTagCount = task.tags.length - visibleTags.length

  const dotColor = agent ? agent.color || defaultAgentColor(agent.id) : undefined
  const assigneeLabel = agent?.name ?? '(unassigned)'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKey}
      data-task-id={task.id}
      aria-label={`Open task ${task.title}`}
      className="flex cursor-pointer flex-col gap-1.5 rounded-sm border border-border-soft bg-bg-2 p-2 transition hover:bg-bg-3 hover:ring-1 hover:ring-accent-500/60 focus:bg-bg-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-500"
    >
      {/* Top row — priority pill + relative time */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`shrink-0 rounded-sm border px-1 py-[1px] font-mono text-[9px] font-semibold tracking-wider ${PRIORITY_PILL[task.priority]}`}
          aria-label={`Priority ${task.priority}`}
        >
          {task.priority}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-text-4">
          {relativeTime(task.createdAt)}
        </span>
      </div>

      {/* Title — 2-line clamp keeps card height predictable. line-clamp-2
          relies on Tailwind's @tailwindcss/line-clamp built-in (v3.3+). */}
      <span
        className="line-clamp-2 break-words text-[12px] leading-snug text-text-1"
        title={task.title}
      >
        {task.title}
      </span>

      {/* Assignee row — coloured dot + name. Dot colour comes from the
          agent's chosen palette with a deterministic fallback keyed on
          agent id so the colour is stable across reloads. */}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor ?? 'var(--color-border-mid, #555)' }}
          aria-hidden
        />
        <span
          className="truncate font-mono text-[10px] text-text-3"
          title={assigneeLabel}
        >
          {assigneeLabel}
        </span>
      </div>

      {/* Tags — hidden entirely when empty so the card stays compact. */}
      {visibleTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="truncate rounded-sm border border-border-soft bg-bg-3 px-1 font-mono text-[9px] text-text-3"
              title={tag}
            >
              #{tag}
            </span>
          ))}
          {hiddenTagCount > 0 ? (
            <span className="font-mono text-[9px] text-text-4">
              +{hiddenTagCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
