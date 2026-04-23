/**
 * CanvasToolbar — horizontal pill of quick actions anchored to the
 * bottom-left of the Orchestra canvas.
 *
 * Distinct from the react-flow `<Controls />` block that lives bottom-right;
 * this toolbar surfaces affordances that today are keyboard-only
 * (fit view, auto-layout) plus a way to open the team templates dialog.
 *
 * The outer wrapper is `pointer-events-none` so double-click on the
 * react-flow pane underneath still registers; the pill opts back in with
 * `pointer-events-auto`.
 */
import { useCallback, useMemo, useState } from 'react'
import { Maximize2, Network, Wand2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import type { Agent, ReportingEdge, UUID } from '../../shared/orchestra'
import { useOrchestra } from './state/orchestra'
import TeamTemplatesDialog from './TeamTemplatesDialog'

interface Props {}

/** Horizontal and vertical spacing for the hierarchical auto-layout.
 *  Wide enough to keep AgentCard edges clear of each other at 1x zoom. */
const LAYOUT_X_STEP = 260
const LAYOUT_Y_STEP = 200

export default function CanvasToolbar(_props: Props) {
  const { fitView } = useReactFlow()
  const activeTeamId = useOrchestra((s) => s.activeTeamId)
  const agents = useOrchestra((s) => s.agents)
  const edges = useOrchestra((s) => s.edges)
  const updateAgent = useOrchestra((s) => s.updateAgent)

  const [templatesOpen, setTemplatesOpen] = useState(false)

  // Scope the graph to the active team — auto-layout must not shuffle
  // agents that belong to a team the user isn't looking at.
  const teamAgents = useMemo(
    () => (activeTeamId ? agents.filter((a) => a.teamId === activeTeamId) : []),
    [agents, activeTeamId]
  )
  const teamEdges = useMemo(
    () => (activeTeamId ? edges.filter((e) => e.teamId === activeTeamId) : []),
    [edges, activeTeamId]
  )

  const hasGraph = teamAgents.length > 0

  const onFit = useCallback((): void => {
    fitView({ duration: 200 })
  }, [fitView])

  const onAutoLayout = useCallback(async (): Promise<void> => {
    if (!hasGraph) return
    const next = computeHierarchicalLayout(teamAgents, teamEdges)
    // Diff against current positions — no point shipping IPC writes for
    // nodes that are already where the layout wants them.
    const writes: Array<Promise<void>> = []
    for (const agent of teamAgents) {
      const target = next.get(agent.id)
      if (!target) continue
      if (target.x === agent.position.x && target.y === agent.position.y) {
        continue
      }
      writes.push(updateAgent({ id: agent.id, patch: { position: target } }))
    }
    if (writes.length === 0) return
    // Fire the whole batch in a single frame so react-flow only re-renders
    // once instead of cascading one update per agent.
    await Promise.all(writes)
  }, [hasGraph, teamAgents, teamEdges, updateAgent])

  const onTemplates = useCallback((): void => {
    setTemplatesOpen(true)
  }, [])

  return (
    <>
      <div className="pointer-events-none absolute bottom-4 left-4 z-30">
        <div className="pointer-events-auto flex items-center gap-1 rounded-sm border border-border-soft bg-bg-2/90 px-1 py-1 shadow-pop backdrop-blur-md">
          <ToolbarButton
            label="Fit to screen"
            shortcutHint="⌘0"
            onClick={onFit}
            aria-label="fit to screen"
          >
            <Maximize2 size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Auto-layout"
            onClick={onAutoLayout}
            disabled={!hasGraph}
            aria-label="auto layout"
          >
            <Network size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Templates"
            onClick={onTemplates}
            aria-label="team templates"
          >
            <Wand2 size={14} strokeWidth={2} />
          </ToolbarButton>
        </div>
      </div>

      <TeamTemplatesDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />
    </>
  )
}

interface ToolbarButtonProps {
  label: string
  shortcutHint?: string
  onClick: () => void
  disabled?: boolean
  'aria-label': string
  children: React.ReactNode
}

function ToolbarButton({
  label,
  shortcutHint,
  onClick,
  disabled = false,
  'aria-label': ariaLabel,
  children
}: ToolbarButtonProps) {
  const tooltipText = shortcutHint ? `${label} · ${shortcutHint}` : label

  return (
    <div className="group relative flex items-center">
      {/* Top-side tooltip — positioned above to avoid colliding with the
       *  react-flow Controls block in the opposite corner. */}
      <div
        className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-sm border border-border-soft bg-bg-2 px-2 py-1 text-[11px] text-text-1 opacity-0 shadow-pop transition-opacity duration-150 group-hover:opacity-100"
        role="tooltip"
      >
        <span>{tooltipText}</span>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        className="flex h-7 w-7 items-center justify-center rounded-sm text-text-2 transition hover:bg-bg-3 hover:text-text-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-2"
      >
        {children}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hierarchical layout — best-effort longest-path levelling over the team DAG.
// ---------------------------------------------------------------------------

interface XY {
  x: number
  y: number
}

/** Assigns each agent a level (= longest path from any root) and packs
 *  them left-to-right within the level, sorted by creation time for a
 *  stable ordering across runs. Cycles (which shouldn't exist on a
 *  reporting DAG but can't be 100% ruled out) are broken by capping the
 *  propagation depth at agent count. */
function computeHierarchicalLayout(
  agents: Agent[],
  edges: ReportingEdge[]
): Map<UUID, XY> {
  const ids = new Set(agents.map((a) => a.id))
  // Only edges whose endpoints are both in the current team scope count —
  // a dangling reference would skew in-degree and create ghost roots.
  const validEdges = edges.filter(
    (e) => ids.has(e.parentAgentId) && ids.has(e.childAgentId)
  )

  const childrenOf = new Map<UUID, UUID[]>()
  const inDegree = new Map<UUID, number>()
  for (const a of agents) {
    childrenOf.set(a.id, [])
    inDegree.set(a.id, 0)
  }
  for (const e of validEdges) {
    childrenOf.get(e.parentAgentId)!.push(e.childAgentId)
    inDegree.set(e.childAgentId, (inDegree.get(e.childAgentId) ?? 0) + 1)
  }

  // Longest-path levelling via BFS relaxation: start every root at 0 and
  // keep propagating `max(parent.level + 1)` until no level grows.
  // Bounded by agent count to defuse accidental cycles.
  const level = new Map<UUID, number>()
  const queue: UUID[] = []
  for (const a of agents) {
    if ((inDegree.get(a.id) ?? 0) === 0) {
      level.set(a.id, 0)
      queue.push(a.id)
    }
  }
  // Orphans whose in-degree is non-zero only because of a cycle — seed
  // them at 0 so they still get laid out instead of floating off-screen.
  for (const a of agents) {
    if (!level.has(a.id)) {
      level.set(a.id, 0)
      queue.push(a.id)
    }
  }

  const maxIterations = agents.length * agents.length + 1
  let iterations = 0
  while (queue.length > 0 && iterations < maxIterations) {
    iterations++
    const id = queue.shift()!
    const curr = level.get(id) ?? 0
    for (const child of childrenOf.get(id) ?? []) {
      const prev = level.get(child) ?? 0
      const next = curr + 1
      if (next > prev) {
        level.set(child, next)
        queue.push(child)
      }
    }
  }

  // Group by level, then sort within each level by creation time so the
  // output is deterministic across re-runs.
  const byLevel = new Map<number, Agent[]>()
  for (const a of agents) {
    const lvl = level.get(a.id) ?? 0
    const bucket = byLevel.get(lvl)
    if (bucket) bucket.push(a)
    else byLevel.set(lvl, [a])
  }

  const result = new Map<UUID, XY>()
  for (const [lvl, bucket] of byLevel) {
    bucket.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    bucket.forEach((agent, idx) => {
      result.set(agent.id, {
        x: LAYOUT_X_STEP * idx,
        y: LAYOUT_Y_STEP * lvl
      })
    })
  }
  return result
}
