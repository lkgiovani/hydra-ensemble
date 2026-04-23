import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Loader2,
  X
} from 'lucide-react'
import type { Agent, Priority, Task, TaskStatus } from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'

interface Props {
  agent: Agent
}

/** Priority rank used for `QUEUED` sorting (P0 = most urgent = highest rank). */
const PRIORITY_RANK: Record<Priority, number> = {
  P0: 3,
  P1: 2,
  P2: 1,
  P3: 0
}

/** Tailwind classes for the priority pill. Mirrors the status-pill idiom
 *  RuntimeTab established — keep palette moves there in lockstep with here. */
function priorityPillStyles(p: Priority): string {
  switch (p) {
    case 'P0':
      return 'bg-status-attention/15 text-status-attention'
    case 'P1':
      return 'bg-status-input/15 text-status-input'
    case 'P2':
      return 'bg-accent-500/15 text-accent-400'
    case 'P3':
    default:
      return 'bg-bg-4 text-text-3'
  }
}

/** Small inline "time ago" helper. The orchestra store streams updates so
 *  timestamps drift — we trade exactness for zero-dependency brevity. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Date.now() - then
  if (diff < 0) return 'now'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'in_progress':
      return (
        <Loader2
          size={12}
          strokeWidth={1.75}
          className="animate-spin text-status-generating"
          aria-label="in progress"
        />
      )
    case 'blocked':
      return (
        <CircleX
          size={12}
          strokeWidth={1.75}
          className="text-status-input"
          aria-label="blocked"
        />
      )
    case 'done':
      return (
        <CircleCheck
          size={12}
          strokeWidth={1.75}
          className="text-status-generating"
          aria-label="done"
        />
      )
    case 'failed':
      return (
        <CircleX
          size={12}
          strokeWidth={1.75}
          className="text-status-attention"
          aria-label="failed"
        />
      )
    case 'queued':
    case 'routing':
    default:
      return null
  }
}

interface RowProps {
  task: Task
  onOpen: (id: string) => void
  onCancel?: (id: string) => void
}

function TaskRow({ task, onOpen, onCancel }: RowProps) {
  const handleCancel = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    if (!onCancel) return
    const ok = window.confirm(`Cancel task "${task.title}"?`)
    if (ok) onCancel(task.id)
  }

  // `in_progress` rows prefer updatedAt (when it started work); everything
  // else leans on createdAt so the user sees "submitted N ago".
  const ts =
    task.status === 'in_progress' ||
    task.status === 'blocked' ||
    task.status === 'done' ||
    task.status === 'failed'
      ? (task.finishedAt ?? task.updatedAt)
      : task.createdAt

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="group flex w-full items-center gap-2 rounded-md border border-border-soft bg-bg-1 px-2.5 py-1.5 text-left hover:border-border-mid hover:bg-bg-3"
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide ${priorityPillStyles(
            task.priority
          )}`}
        >
          {task.priority}
        </span>
        <StatusIcon status={task.status} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-text-2 group-hover:text-text-1">
          {task.title}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-text-4">
          {relativeTime(ts)}
        </span>
        {onCancel ? (
          <span
            role="button"
            tabIndex={0}
            onClick={handleCancel}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                if (!onCancel) return
                const ok = window.confirm(`Cancel task "${task.title}"?`)
                if (ok) onCancel(task.id)
              }
            }}
            className="ml-1 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border-soft p-0.5 text-text-3 hover:border-status-attention/40 hover:bg-status-attention/10 hover:text-status-attention"
            title="cancel task"
            aria-label="cancel task"
          >
            <X size={11} strokeWidth={2} />
          </span>
        ) : null}
      </button>
    </li>
  )
}

interface SectionProps {
  label: string
  tasks: Task[]
  onOpen: (id: string) => void
  onCancel?: (id: string) => void
  collapsible?: boolean
  defaultOpen?: boolean
}

function Section({
  label,
  tasks,
  onOpen,
  onCancel,
  collapsible = false,
  defaultOpen = true
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  if (tasks.length === 0) return null

  const body = (
    <ul className="space-y-1.5">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={onOpen} onCancel={onCancel} />
      ))}
    </ul>
  )

  if (!collapsible) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="df-label">{label}</div>
          <span className="font-mono text-[10px] text-text-4">{tasks.length}</span>
        </div>
        {body}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-1">
          {open ? (
            <ChevronDown size={12} strokeWidth={1.75} className="text-text-3" />
          ) : (
            <ChevronRight size={12} strokeWidth={1.75} className="text-text-3" />
          )}
          <span className="df-label">{label}</span>
        </div>
        <span className="font-mono text-[10px] text-text-4">{tasks.length}</span>
      </button>
      {open ? body : null}
    </div>
  )
}

export default function InboxTab({ agent }: Props) {
  const tasks = useOrchestra((s) => s.tasks)
  const setTaskDrawer = useOrchestra((s) => s.setTaskDrawer)
  const cancelTask = useOrchestra((s) => s.cancelTask)

  // One pass over the agent's tasks bucketed by status. Re-runs whenever
  // the mirrored `tasks` slice changes — cheap relative to the IPC cadence.
  const { now, queued, done, failed, total } = useMemo(() => {
    const mine = tasks.filter((t) => t.assignedAgentId === agent.id)
    const nowBucket: Task[] = []
    const queuedBucket: Task[] = []
    const doneBucket: Task[] = []
    const failedBucket: Task[] = []

    for (const t of mine) {
      switch (t.status) {
        case 'in_progress':
        case 'blocked':
          nowBucket.push(t)
          break
        case 'queued':
        case 'routing':
          queuedBucket.push(t)
          break
        case 'done':
          doneBucket.push(t)
          break
        case 'failed':
          failedBucket.push(t)
          break
      }
    }

    nowBucket.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    queuedBucket.sort((a, b) => {
      const rank = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
      if (rank !== 0) return rank
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    doneBucket.sort(
      (a, b) =>
        new Date(b.finishedAt ?? b.updatedAt).getTime() -
        new Date(a.finishedAt ?? a.updatedAt).getTime()
    )
    failedBucket.sort(
      (a, b) =>
        new Date(b.finishedAt ?? b.updatedAt).getTime() -
        new Date(a.finishedAt ?? a.updatedAt).getTime()
    )

    return {
      now: nowBucket,
      queued: queuedBucket,
      done: doneBucket,
      failed: failedBucket,
      total: mine.length
    }
  }, [tasks, agent.id])

  const activeCount = now.length + queued.length
  const doneCount = done.length

  const onOpen = (id: string): void => {
    setTaskDrawer(id)
  }
  const onCancel = (id: string): void => {
    void cancelTask(id)
  }

  if (total === 0) {
    return (
      <div className="df-scroll flex h-full flex-col">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div className="df-label">inbox</div>
          <span className="font-mono text-[10px] text-text-4">0 active · 0 done</span>
        </div>
        <div className="flex-1 px-4 pb-4">
          <div className="rounded-md border border-dashed border-border-soft bg-bg-1 px-3 py-6 text-center text-[11px] leading-relaxed text-text-4">
            No tasks assigned — drop one from the Tasks panel with this agent
            as assignee.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="df-scroll flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="df-label">inbox</div>
        <span className="font-mono text-[10px] text-text-4">
          {activeCount} active · {doneCount} done
        </span>
      </div>

      <div className="space-y-4 px-4 pb-4">
        <Section label="now" tasks={now} onOpen={onOpen} onCancel={onCancel} />
        <Section label="queued" tasks={queued} onOpen={onOpen} />
        <Section
          label="done"
          tasks={done}
          onOpen={onOpen}
          collapsible
          defaultOpen={false}
        />
        <Section
          label="failed"
          tasks={failed}
          onOpen={onOpen}
          collapsible
          defaultOpen={false}
        />
      </div>
    </div>
  )
}
