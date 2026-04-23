import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, FileText, RefreshCw } from 'lucide-react'
import type { Agent, ReportingEdge } from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'

interface Props {
  agent: Agent
}

/**
 * Prompt Preview tab — mirrors the system prompt the agent sees before each
 * turn. The backend (`buildSystemPrompt` in `main/orchestra/agent-runner.ts`)
 * concatenates, in order:
 *
 *   1. Team CLAUDE.md
 *   2. Agent soul.md
 *   3. Topology snapshot (built by `buildTopologySnapshot` in
 *      `main/orchestra/index.ts`)
 *
 * We re-derive the topology here from the renderer's orchestra store so we
 * avoid adding a new IPC method. The string shape is kept visually consistent
 * with the backend's Markdown layout so debugging "what does my agent see?"
 * stays intuitive.
 *
 * NOTE: the backend version of the topology also inlines skill tags per agent
 * (self + direct reports). We skip that here — parity would mean issuing one
 * `window.api.orchestra.agent.readSkills(id)` per report, which isn't worth
 * the IO for the MVP preview. If we want full parity later, we can fan-out
 * those reads in an effect and inject the tags under each "- **Name**" line.
 */

type LoadState = 'loading' | 'ready' | 'error'

interface Loaded {
  teamMd: string
  soul: string
  teamErr: string | null
  soulErr: string | null
}

const EMPTY_LOADED: Loaded = {
  teamMd: '',
  soul: '',
  teamErr: null,
  soulErr: null
}

async function readTeamClaudeMd(teamId: string): Promise<{ value: string; error: string | null }> {
  const fn = window.api?.orchestra?.team?.readClaudeMd
  if (!fn) return { value: '', error: 'file I/O not wired' }
  try {
    const res = await fn(teamId)
    if (res && res.ok) return { value: res.value ?? '', error: null }
    return { value: '', error: (res && res.error) || 'unknown error' }
  } catch (err) {
    return { value: '', error: (err as Error).message }
  }
}

async function readAgentSoul(agentId: string): Promise<{ value: string; error: string | null }> {
  const fn = window.api?.orchestra?.agent?.readSoul
  if (!fn) return { value: '', error: 'file I/O not wired' }
  try {
    const res = await fn(agentId)
    if (res && res.ok) return { value: res.value ?? '', error: null }
    return { value: '', error: (res && res.error) || 'unknown error' }
  } catch (err) {
    return { value: '', error: (err as Error).message }
  }
}

/**
 * Build the topology Markdown snapshot using the same layout as the backend.
 * Keep shape in sync with `buildTopologySnapshot` in main/orchestra/index.ts.
 */
function buildTopologySnapshot(
  self: Agent,
  teamAgents: Agent[],
  teamEdges: ReportingEdge[]
): string {
  const byId = new Map(teamAgents.map((a) => [a.id, a]))

  const reports = teamEdges
    .filter((e) => e.parentAgentId === self.id)
    .map((e) => ({ agent: byId.get(e.childAgentId), edge: e }))
    .filter((r): r is { agent: Agent; edge: ReportingEdge } => !!r.agent)

  const managers = teamEdges
    .filter((e) => e.childAgentId === self.id)
    .map((e) => byId.get(e.parentAgentId))
    .filter((a): a is Agent => !!a)

  const relatedIds = new Set<string>([
    ...reports.map((r) => r.agent.id),
    ...managers.map((m) => m.id)
  ])
  const teammates = teamAgents.filter(
    (a) => a.id !== self.id && !relatedIds.has(a.id)
  )

  const sections: string[] = []

  const selfLines = [`## Your role`, `- id: ${self.id}`, `- name: ${self.name}`]
  if (self.role) selfLines.push(`- role: ${self.role}`)
  if (self.description) selfLines.push(`- description: ${self.description}`)
  sections.push(selfLines.join('\n'))

  if (managers.length > 0) {
    const lines = [`## Your manager(s)`]
    for (const m of managers) {
      lines.push(`- **${m.name}** (role: ${m.role || 'n/a'}, id: ${m.id})`)
    }
    sections.push(lines.join('\n'))
  }

  if (reports.length > 0) {
    const lines = [`## Your direct reports`]
    for (const r of reports) {
      lines.push(
        `- **${r.agent.name}** (role: ${r.agent.role || 'n/a'}, id: ${r.agent.id})`
      )
      lines.push(`  delegation: ${r.edge.delegationMode}`)
      if (r.agent.description) {
        lines.push(`  description: ${r.agent.description}`)
      }
    }
    sections.push(lines.join('\n'))
  }

  if (teammates.length > 0) {
    const lines = [`## Your teammates`]
    for (const t of teammates) {
      lines.push(`- **${t.name}** (role: ${t.role || 'n/a'})`)
    }
    sections.push(lines.join('\n'))
  }

  sections.push(
    [
      `## Delegation protocol`,
      `- Only delegate to a **direct report** listed above.`,
      `- Use the \`delegate_task\` tool. Pass \`toAgentId\` (exact id from the list), \`reason\`, \`title\`, \`body\`, optional \`priority\` (P0-P3), optional \`tags\`.`,
      `- If no report matches the skills needed, DO the work yourself.`,
      `- After delegating, stop — the child agent will continue.`
    ].join('\n')
  )

  sections.push(
    [
      `## Task completion`,
      `- When you finish a turn AND the task is complete, end with a final message summarising what you did. Do not call any more tools.`,
      `- If blocked, write a clear blocker message and stop.`
    ].join('\n')
  )

  return sections.join('\n\n')
}

export default function PromptTab({ agent }: Props) {
  const agents = useOrchestra((s) => s.agents)
  const edges = useOrchestra((s) => s.edges)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [data, setData] = useState<Loaded>(EMPTY_LOADED)
  const [copiedAt, setCopiedAt] = useState<number | null>(null)

  // Topology is a pure derivation — recompute when the orchestra store moves.
  const topology = useMemo(() => {
    const teamAgents = agents.filter((a) => a.teamId === agent.teamId)
    const teamEdges = edges.filter((e) => e.teamId === agent.teamId)
    return buildTopologySnapshot(agent, teamAgents, teamEdges)
  }, [agent, agents, edges])

  const load = useCallback(async (): Promise<void> => {
    setLoadState('loading')
    const [team, soul] = await Promise.all([
      readTeamClaudeMd(agent.teamId),
      readAgentSoul(agent.id)
    ])
    setData({
      teamMd: team.value,
      soul: soul.value,
      teamErr: team.error,
      soulErr: soul.error
    })
    setLoadState('ready')
  }, [agent.id, agent.teamId])

  useEffect(() => {
    void load()
  }, [load])

  // Fade the "copied" pip after a short beat so repeated clicks still feel
  // responsive without leaving a stale badge.
  useEffect(() => {
    if (copiedAt === null) return
    const t = setTimeout(() => setCopiedAt(null), 1200)
    return () => clearTimeout(t)
  }, [copiedAt])

  const fullPrompt = useMemo(() => {
    // Match the backend's section separator so a copy-pasted preview is a
    // byte-for-byte window into what the agent will receive (minus the
    // trailing `# Current task` block, which is task-dependent).
    const parts: string[] = []
    if (data.teamMd.trim()) parts.push(data.teamMd.trim())
    if (data.soul.trim()) parts.push(data.soul.trim())
    if (topology.trim()) parts.push(topology.trim())
    return parts.join('\n\n---\n\n')
  }, [data.teamMd, data.soul, topology])

  const onCopyAll = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(fullPrompt)
      setCopiedAt(Date.now())
    } catch {
      // Clipboard can fail in non-secure contexts or if permission is denied;
      // we swallow silently — there's no clean UI affordance for this edge
      // case and the user can always select-and-copy the visible <pre>.
    }
  }, [fullPrompt])

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-soft bg-bg-1 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium lowercase text-text-2">
            <FileText size={11} strokeWidth={1.75} />
            <span>system prompt preview</span>
          </div>
          <div className="mt-0.5 text-[10px] text-text-4">
            this is what the agent sees before each turn — task body appended
          </div>
        </div>
      </header>

      <div className="df-scroll min-h-0 flex-1 overflow-y-auto">
        <Section
          title="team CLAUDE.md"
          body={data.teamMd}
          loading={loadState === 'loading'}
          error={data.teamErr}
        />
        <Section
          title="agent soul"
          body={data.soul}
          loading={loadState === 'loading'}
          error={data.soulErr}
        />
        <Section
          title="topology snapshot"
          body={topology}
          loading={false}
          error={null}
        />
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border-soft bg-bg-1 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onCopyAll()}
            className="flex items-center gap-1 rounded-sm border border-border-soft bg-bg-2 px-2 py-1 text-[11px] text-text-2 hover:border-border-mid hover:text-text-1"
          >
            <Copy size={11} strokeWidth={1.75} />
            <span>copy all</span>
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 rounded-sm border border-border-soft bg-bg-2 px-2 py-1 text-[11px] text-text-2 hover:border-border-mid hover:text-text-1"
          >
            <RefreshCw size={11} strokeWidth={1.75} />
            <span>refresh</span>
          </button>
        </div>
        {copiedAt !== null ? (
          <span className="font-mono text-[10px] text-accent-400">copied</span>
        ) : null}
      </footer>
    </div>
  )
}

interface SectionProps {
  title: string
  body: string
  loading: boolean
  error: string | null
}

function Section({ title, body, loading, error }: SectionProps) {
  const trimmed = body.trim()
  return (
    <section className="border-b border-border-soft">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="df-label">{title}</span>
        {error ? (
          <span className="font-mono text-[10px] text-red-400">{error}</span>
        ) : null}
      </div>
      <pre className="df-mono-surface whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] leading-relaxed text-text-1">
        {loading ? (
          <span className="text-text-4">loading…</span>
        ) : trimmed ? (
          trimmed
        ) : (
          <span className="text-text-4">—</span>
        )}
      </pre>
    </section>
  )
}
