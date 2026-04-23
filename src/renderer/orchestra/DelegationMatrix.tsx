/**
 * DelegationMatrix — complements the reporting DAG (canvas) with a view of
 * the *actual* delegation flow: who delegated to whom, and how many times,
 * aggregated from the routing log.
 *
 * The canvas shows the *intended* topology (reporting edges). This view
 * shows what actually happened at runtime — useful to spot hotspots, dead
 * edges, or unexpected cross-team traffic within the active team.
 *
 * Data model
 * ----------
 * The router tags a `Route` with `reason = "delegation:<parentAgentId>"`
 * whenever the task was dispatched as a delegation from another agent.
 * We parse that prefix to recover the parent; the child is the route's
 * `chosenAgentId`. Routes don't carry `teamId` directly, so we resolve
 * team membership through the task (`routes → tasks → task.teamId`).
 *
 * Layout is a pure-CSS grid. Rows = "from" (delegator), columns = "to"
 * (delegatee). Intensity buckets are tuned for a fresh team (most counts
 * land in 1–9, with the 10+ bucket catching runaway delegators).
 *
 * Absolutely no chart/matrix libs — Tailwind tokens + a single `grid`.
 */

import { ArrowRight, CornerDownRight } from 'lucide-react'
import { useMemo } from 'react'
import type { Agent } from '../../shared/orchestra'
import { useOrchestra } from './state/orchestra'

const DELEGATION_REASON_RE = /^delegation:(.+)$/

type MatrixRow = {
  parent: Agent
  /** child agent id → count (only populated for non-zero cells) */
  byChild: Map<string, number>
  /** total delegations issued from this parent */
  sent: number
}

interface Totals {
  total: number
  topSender: { agent: Agent; count: number } | null
  topReceiver: { agent: Agent; count: number } | null
}

interface Props {}

export default function DelegationMatrix(_props: Props) {
  const activeTeamId = useOrchestra((s) => s.activeTeamId)
  const agents = useOrchestra((s) => s.agents)
  const tasks = useOrchestra((s) => s.tasks)
  const routes = useOrchestra((s) => s.routes)

  const { teamAgents, rows, totals } = useMemo(() => {
    const teamAgents = agents
      .filter((a) => a.teamId === activeTeamId)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))

    const agentById = new Map(teamAgents.map((a) => [a.id, a]))
    const taskById = new Map(tasks.map((t) => [t.id, t]))

    // parentId → childId → count
    const counts = new Map<string, Map<string, number>>()
    const received = new Map<string, number>()
    let total = 0

    for (const route of routes) {
      const match = DELEGATION_REASON_RE.exec(route.reason)
      const parentId = match?.[1]
      if (!parentId) continue

      const childId = route.chosenAgentId
      if (parentId === childId) continue

      // Resolve team via the task; a route whose task belongs to another
      // team (or has been purged) is skipped silently.
      const task = taskById.get(route.taskId)
      if (!task || task.teamId !== activeTeamId) continue

      // Both endpoints must still exist in the active team. If an agent
      // was deleted, the historical delegation is dropped from the view
      // to keep the matrix self-consistent with its headers.
      if (!agentById.has(parentId) || !agentById.has(childId)) continue

      let bucket = counts.get(parentId)
      if (!bucket) {
        bucket = new Map<string, number>()
        counts.set(parentId, bucket)
      }
      bucket.set(childId, (bucket.get(childId) ?? 0) + 1)
      received.set(childId, (received.get(childId) ?? 0) + 1)
      total += 1
    }

    const rows: MatrixRow[] = teamAgents.map((parent) => {
      const byChild = counts.get(parent.id) ?? new Map<string, number>()
      let sent = 0
      for (const n of byChild.values()) sent += n
      return { parent, byChild, sent }
    })

    const topSender = rows.reduce<Totals['topSender']>((acc, r) => {
      if (r.sent === 0) return acc
      if (!acc || r.sent > acc.count) return { agent: r.parent, count: r.sent }
      return acc
    }, null)

    let topReceiver: Totals['topReceiver'] = null
    for (const [childId, count] of received) {
      const agent = agentById.get(childId)
      if (!agent) continue
      if (!topReceiver || count > topReceiver.count) {
        topReceiver = { agent, count }
      }
    }

    const totals: Totals = { total, topSender, topReceiver }
    return { teamAgents, rows, totals }
  }, [activeTeamId, agents, tasks, routes])

  if (!activeTeamId) return null

  const hasAgents = teamAgents.length > 0
  const isEmpty = totals.total === 0

  return (
    <div className="mx-auto w-full max-w-[min(100%,720px)] rounded-sm border border-border-soft bg-bg-2 shadow-pop">
      <header className="flex items-center gap-2 border-b border-border-soft px-3 py-2">
        <CornerDownRight
          size={12}
          strokeWidth={1.75}
          className="text-accent-400"
          aria-hidden
        />
        <span className="df-label text-[10px] text-text-3">
          delegation matrix
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-text-4">
          <span>from</span>
          <ArrowRight size={10} strokeWidth={1.75} aria-hidden />
          <span>to</span>
        </span>
      </header>

      <div className="px-3 py-3">
        {!hasAgents ? (
          <EmptyState message="No agents in this team yet." />
        ) : isEmpty ? (
          <EmptyState message="No delegations yet in this team." />
        ) : (
          <Grid rows={rows} columns={teamAgents} />
        )}
      </div>

      {hasAgents && !isEmpty ? (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-soft px-3 py-2 text-[11px] text-text-3">
          <span>
            Total delegations:{' '}
            <span className="font-mono font-semibold text-text-1">
              {totals.total}
            </span>
          </span>
          {totals.topSender ? (
            <span>
              Most active delegator:{' '}
              <span className="font-semibold text-text-1">
                {totals.topSender.agent.name}
              </span>{' '}
              <span className="text-text-4">
                ({totals.topSender.count} sent)
              </span>
            </span>
          ) : null}
          {totals.topReceiver ? (
            <span>
              Most delegated-to:{' '}
              <span className="font-semibold text-text-1">
                {totals.topReceiver.agent.name}
              </span>{' '}
              <span className="text-text-4">
                ({totals.topReceiver.count} received)
              </span>
            </span>
          ) : null}
        </footer>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

function Grid({
  rows,
  columns
}: {
  rows: MatrixRow[]
  columns: Agent[]
}) {
  // First track is the row-header column, followed by one `minmax` track
  // per agent column. `minmax(0,1fr)` lets the cells compress on narrow
  // containers without forcing a horizontal scroll.
  const gridTemplateColumns = `minmax(72px, 96px) repeat(${columns.length}, minmax(28px, 1fr))`

  return (
    <div className="overflow-x-auto">
      <div
        role="grid"
        aria-label="Delegation counts from (row) to (column)"
        className="grid min-w-max gap-px rounded-sm bg-border-soft"
        style={{ gridTemplateColumns }}
      >
        {/* Top-left corner: empty */}
        <div
          role="presentation"
          className="bg-bg-2 px-2 py-1.5 text-[9px] font-medium uppercase tracking-wide text-text-4"
        >
          from \ to
        </div>

        {/* Column headers */}
        {columns.map((col) => (
          <div
            key={col.id}
            role="columnheader"
            title={`${col.name} · ${col.role}`}
            className="bg-bg-2 px-1 py-1.5 text-center text-[10px] font-medium text-text-2"
          >
            <span className="block truncate">{shortName(col.name)}</span>
          </div>
        ))}

        {/* Data rows */}
        {rows.map((row) => (
          <RowCells key={row.parent.id} row={row} columns={columns} />
        ))}
      </div>
    </div>
  )
}

function RowCells({
  row,
  columns
}: {
  row: MatrixRow
  columns: Agent[]
}) {
  return (
    <>
      <div
        role="rowheader"
        title={`${row.parent.name} · ${row.parent.role}`}
        className="flex items-center bg-bg-2 px-2 py-1.5 text-[11px] font-medium text-text-2"
      >
        <span className="truncate">{shortName(row.parent.name)}</span>
      </div>
      {columns.map((col) => {
        const isDiagonal = col.id === row.parent.id
        const count = isDiagonal ? 0 : (row.byChild.get(col.id) ?? 0)
        return (
          <Cell
            key={col.id}
            count={count}
            isDiagonal={isDiagonal}
            fromName={row.parent.name}
            toName={col.name}
          />
        )
      })}
    </>
  )
}

function Cell({
  count,
  isDiagonal,
  fromName,
  toName
}: {
  count: number
  isDiagonal: boolean
  fromName: string
  toName: string
}) {
  if (isDiagonal) {
    return (
      <div
        role="gridcell"
        aria-label={`${fromName} cannot delegate to itself`}
        className="flex items-center justify-center bg-bg-1 px-1 py-1.5 text-[12px] text-text-4"
      >
        ·
      </div>
    )
  }

  const bg = intensityBg(count)
  const label =
    count === 0
      ? `${fromName} has not delegated to ${toName}`
      : `${fromName} delegated ${count}× to ${toName}`

  return (
    <div
      role="gridcell"
      title={label}
      aria-label={label}
      className={`flex items-center justify-center px-1 py-1.5 font-mono text-[11px] tabular-nums ${bg} ${
        count === 0 ? 'text-transparent' : 'text-text-1'
      }`}
    >
      {count === 0 ? '' : count}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intensityBg(count: number): string {
  if (count <= 0) return 'bg-bg-1'
  if (count >= 10) return 'bg-accent-500/60'
  if (count >= 3) return 'bg-accent-500/35'
  return 'bg-accent-500/15'
}

function shortName(name: string): string {
  return name.length <= 10 ? name : `${name.slice(0, 9)}…`
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-dashed border-border-soft bg-bg-1 px-3 py-6 text-center text-[11px] text-text-4">
      {message}
    </div>
  )
}
