/**
 * TeamTemplatesDialog — provisions a ready-made team (agents + reporting
 * edges) from a curated catalog in one click.
 *
 * Flow
 * ----
 * 1. User picks a template card and clicks "Use template".
 * 2. The dialog swaps into "configure" mode: inline prompt for the team
 *    name (pre-filled from `template.name`) plus a worktree picker.
 * 3. On confirm, we:
 *      - call `createTeam(...)`
 *      - create each agent sequentially via `createAgent(...)`, splicing
 *        in the freshly-minted team id
 *      - build a `localKey → real UUID` map keyed by slug AND by the
 *        exact agent name we sent, so edge resolution works on either.
 *      - create each edge via `createEdge(...)`
 * 4. A progress bar updates between calls. If the user clicks "Cancel"
 *    mid-flight we set an abort flag — whatever has been created so far
 *    stays (no rollback IPC exists yet), but no further calls fire.
 * 5. Success toast, close. Any IPC failure mid-way surfaces as a toast via
 *    the store's built-in error handling; we still close on "fatal" first
 *    failures (team or agent creation returning null) so the user isn't
 *    staring at an ambiguous spinner.
 *
 * Why sequential
 * --------------
 * Agents are created one at a time so that the edge-resolution map is
 * built deterministically and so that a mid-stream IPC failure stops
 * cleanly. The per-team cost is bounded (templates cap out at ~5 agents),
 * so parallelism would buy us nothing visible to the user.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from 'react'
import {
  ArrowRight,
  Layers,
  Loader2,
  Users,
  Wand2,
  X
} from 'lucide-react'
import type { Agent, NewAgentInput } from '../../shared/orchestra'
import { useOrchestra } from './state/orchestra'
import { useToasts } from '../state/toasts'
import {
  LAYOUT_GRID,
  TEAM_TEMPLATES,
  materializeAgentDrafts,
  materializeEdgeDrafts,
  type TeamTemplate
} from './lib/templates'

interface Props {
  open: boolean
  onClose: () => void
}

/** Preset → icon colour tint for the tiny role strip on each card. We
 *  reuse a small palette so the strip reads at a glance without needing
 *  per-agent colouring. */
const PRESET_TINT: Record<NonNullable<NewAgentInput['preset']>, string> = {
  pm: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  dev: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  reviewer: 'text-violet-300 border-violet-500/40 bg-violet-500/10',
  qa: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  blank: 'text-text-3 border-border-mid bg-bg-3'
}

const SAFE_MODE_COPY: Record<TeamTemplate['defaultSafeMode'], string> = {
  strict: 'safe: strict',
  prompt: 'safe: prompt',
  yolo: 'safe: yolo'
}

/** Derive the canvas dimensions for the mini preview svg from the
 *  template's grid. Keeps the preview centred no matter the shape. */
function previewBounds(t: TeamTemplate): {
  cols: number
  rows: number
} {
  let cols = 1
  let rows = 1
  for (const a of t.agents) {
    if (a.col > cols - 1) cols = Math.ceil(a.col + 1)
    if (a.row > rows - 1) rows = a.row + 1
  }
  return { cols, rows }
}

/** Lightweight slug used to key the localKey → UUID map. Mirrors
 *  `lib/templates.ts` but repeated here to avoid leaking it as a public
 *  export. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TemplatePreview({ template }: { template: TeamTemplate }): ReactElement {
  const { cols, rows } = previewBounds(template)
  // svg viewBox covers a slightly-padded grid so nodes don't clip at the
  // edges.
  const cellW = 40
  const cellH = 28
  const padX = 8
  const padY = 6
  const width = cols * cellW + padX * 2
  const height = rows * cellH + padY * 2

  // Build node positions keyed by slug so edges resolve cheaply.
  const nodeByKey = new Map<string, { cx: number; cy: number }>()
  for (const a of template.agents) {
    nodeByKey.set(slugify(a.name), {
      cx: padX + (a.col + 0.5) * cellW,
      cy: padY + (a.row + 0.5) * cellH
    })
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-full text-border-mid"
      aria-hidden="true"
    >
      {/* edges first so they sit behind nodes */}
      {template.edges.map((e, idx) => {
        const p = nodeByKey.get(slugify(e.parentSlugOrName))
        const c = nodeByKey.get(slugify(e.childSlugOrName))
        if (!p || !c) return null
        return (
          <line
            key={`e-${idx}`}
            x1={p.cx}
            y1={p.cy}
            x2={c.cx}
            y2={c.cy}
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity={0.6}
          />
        )
      })}
      {template.agents.map((a) => {
        const key = slugify(a.name)
        const pos = nodeByKey.get(key)!
        const preset = a.preset ?? 'blank'
        const fill =
          preset === 'pm'
            ? '#f59e0b'
            : preset === 'dev'
              ? '#38bdf8'
              : preset === 'reviewer'
                ? '#a78bfa'
                : preset === 'qa'
                  ? '#34d399'
                  : '#9ca3af'
        return (
          <g key={key}>
            <circle cx={pos.cx} cy={pos.cy} r={6} fill={fill} opacity={0.85} />
            <circle
              cx={pos.cx}
              cy={pos.cy}
              r={6}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.75"
              opacity={0.9}
            />
          </g>
        )
      })}
    </svg>
  )
}

interface CardProps {
  template: TeamTemplate
  onUse: (template: TeamTemplate) => void
  disabled: boolean
}

function TemplateCard({ template, onUse, disabled }: CardProps): ReactElement {
  return (
    <article
      className="flex flex-col gap-3 rounded-sm border border-border-mid bg-bg-1 p-3 transition hover:border-accent-500/60"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-xs font-semibold text-text-1">
            {template.name}
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-text-3">
            {template.tagline}
          </p>
        </div>
        <span className="shrink-0 rounded-sm border border-border-soft bg-bg-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-4">
          {SAFE_MODE_COPY[template.defaultSafeMode]}
        </span>
      </header>

      <TemplatePreview template={template} />

      {/* Role strip — one chip per agent so the card conveys the team
          shape without making the user open a modal-within-a-modal. */}
      <ul className="flex flex-wrap items-center gap-1">
        {template.agents.map((a) => {
          const preset = a.preset ?? 'blank'
          return (
            <li key={slugify(a.name)}>
              <span
                className={`inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[9px] ${PRESET_TINT[preset]}`}
                title={`${a.name}${a.role ? ` — ${a.role}` : ''}`}
              >
                {a.name}
              </span>
            </li>
          )
        })}
      </ul>

      <footer className="mt-auto flex items-center justify-between pt-1">
        <span className="font-mono text-[10px] text-text-4">
          {template.agents.length} agents · {template.edges.length} edges
        </span>
        <button
          type="button"
          onClick={() => onUse(template)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-sm bg-accent-500 px-2.5 py-1 font-mono text-[10px] font-semibold text-bg-0 hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Wand2 size={10} strokeWidth={2} />
          Use template
          <ArrowRight size={10} strokeWidth={2} />
        </button>
      </footer>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface ProvisioningState {
  template: TeamTemplate
  stage: 'configure' | 'running'
  teamName: string
  worktreePath: string
  /** Total planned steps: 1 (team) + N agents + M edges. */
  total: number
  done: number
  currentLabel: string
}

export default function TeamTemplatesDialog({ open, onClose }: Props) {
  const createTeam = useOrchestra((s) => s.createTeam)
  const createAgent = useOrchestra((s) => s.createAgent)
  const createEdge = useOrchestra((s) => s.createEdge)

  const [state, setState] = useState<ProvisioningState | null>(null)
  // Abort flag is a ref — we read it from inside the running async flow,
  // and setState would be ignored because the closure captures the old
  // value. A ref sidesteps that.
  const abortRef = useRef(false)
  const pickingRef = useRef(false)

  // Reset on close so a re-open starts from the template grid.
  useEffect(() => {
    if (!open) {
      setState(null)
      abortRef.current = false
      pickingRef.current = false
    }
  }, [open])

  // Esc closes the whole dialog — unless we're mid-provision, in which
  // case the button-driven "Cancel" path is the only way out (so the user
  // sees the abort explicitly).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (state?.stage === 'running') return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, state?.stage])

  const pickWorktree = useCallback(async (): Promise<void> => {
    if (pickingRef.current) return
    pickingRef.current = true
    try {
      const chosen = await window.api.project.pickDirectory()
      if (!chosen) return
      setState((prev) => (prev ? { ...prev, worktreePath: chosen } : prev))
    } finally {
      pickingRef.current = false
    }
  }, [])

  const startConfigure = useCallback((template: TeamTemplate): void => {
    abortRef.current = false
    setState({
      template,
      stage: 'configure',
      teamName: template.name,
      worktreePath: '',
      total: 1 + template.agents.length + template.edges.length,
      done: 0,
      currentLabel: ''
    })
  }, [])

  const runProvisioning = useCallback(async (): Promise<void> => {
    if (!state || state.stage !== 'configure') return
    const { template, teamName, worktreePath } = state
    if (teamName.trim().length === 0) {
      useToasts.getState().push({
        kind: 'error',
        title: 'Team name required',
        body: 'Give the team a name before provisioning.'
      })
      return
    }
    if (worktreePath.trim().length === 0) {
      useToasts.getState().push({
        kind: 'error',
        title: 'Worktree required',
        body: 'Pick a worktree folder before provisioning.'
      })
      return
    }

    abortRef.current = false
    setState({
      ...state,
      stage: 'running',
      done: 0,
      currentLabel: `Creating team "${teamName}"…`
    })

    const drafts = materializeAgentDrafts(template)

    // Step 1: create the team.
    const team = await createTeam({
      name: teamName.trim(),
      worktreePath: worktreePath.trim(),
      safeMode: template.defaultSafeMode,
      defaultModel: template.defaultModel
    })
    if (!team) {
      // createTeam already toasted. Drop back to configure so the user can
      // fix the path and retry without losing context.
      setState((prev) =>
        prev ? { ...prev, stage: 'configure', currentLabel: '' } : prev
      )
      return
    }
    if (abortRef.current) {
      finishAbort('Team created, agents skipped after cancel.')
      return
    }

    // Step 2: create each agent, recording the real id under BOTH the
    // slug and the exact name we sent, so edge resolution is forgiving.
    const agentIdByKey: Record<string, string> = {}
    const created: Agent[] = []
    for (let i = 0; i < drafts.length; i++) {
      if (abortRef.current) {
        finishAbort(
          `Aborted after ${created.length}/${drafts.length} agents.`
        )
        return
      }
      const draft = drafts[i]!
      setState((prev) =>
        prev
          ? {
              ...prev,
              done: 1 + i,
              currentLabel: `Creating agent "${draft.name}"…`
            }
          : prev
      )
      const { localKey, ...input } = draft
      const agent = await createAgent({ ...input, teamId: team.id })
      if (!agent) {
        // createAgent toasted; keep whatever was created, stop the flow.
        finishAbort(`Failed creating agent "${draft.name}".`)
        return
      }
      agentIdByKey[localKey] = agent.id
      agentIdByKey[slugify(agent.name)] = agent.id
      agentIdByKey[agent.name.toLowerCase()] = agent.id
      created.push(agent)
    }

    // Step 3: edges.
    const edges = materializeEdgeDrafts(template, agentIdByKey)
    for (let i = 0; i < edges.length; i++) {
      if (abortRef.current) {
        finishAbort(
          `Aborted after ${i}/${edges.length} edges (agents already created).`
        )
        return
      }
      const edgeDraft = edges[i]!
      setState((prev) =>
        prev
          ? {
              ...prev,
              done: 1 + created.length + i,
              currentLabel: `Linking edges (${i + 1}/${edges.length})…`
            }
          : prev
      )
      await createEdge({
        teamId: team.id,
        parentAgentId: edgeDraft.parentAgentId,
        childAgentId: edgeDraft.childAgentId,
        delegationMode: edgeDraft.delegationMode ?? 'auto'
      })
    }

    useToasts.getState().push({
      kind: 'success',
      title: 'Team provisioned',
      body: `${team.name}: ${created.length} agents, ${edges.length} edges.`
    })
    onClose()

    function finishAbort(body: string): void {
      useToasts.getState().push({
        kind: 'attention',
        title: 'Provisioning cancelled',
        body
      })
      setState((prev) =>
        prev ? { ...prev, stage: 'configure', currentLabel: '' } : prev
      )
    }
  }, [state, createTeam, createAgent, createEdge, onClose])

  const cancelRunning = useCallback((): void => {
    abortRef.current = true
  }, [])

  const progressPct = useMemo(() => {
    if (!state) return 0
    if (state.total <= 0) return 0
    return Math.min(100, Math.round((state.done / state.total) * 100))
  }, [state])

  if (!open) return null

  const running = state?.stage === 'running'
  const configuring = state?.stage === 'configure'

  return (
    <div
      className="df-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-bg-0/85 px-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !running) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="team templates"
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{ borderRadius: 'var(--radius-lg)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border-soft bg-bg-1 px-3 py-2">
          <div className="flex items-center gap-2">
            <Layers size={14} strokeWidth={1.75} className="text-accent-500" />
            <span className="df-label">team templates</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
            aria-label="close"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </header>

        {/* Body */}
        {state === null ? (
          // --- Template grid ---
          <div className="flex flex-col gap-3 p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-text-3">
              <Users size={12} strokeWidth={1.75} className="text-text-4" />
              Pick a template to spin up a team (agents + reporting edges) in
              one click. Layout grid:{' '}
              <code className="font-mono text-[10px] text-text-2">
                {LAYOUT_GRID.x}×{LAYOUT_GRID.y}
              </code>{' '}
              px per cell.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {TEAM_TEMPLATES.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onUse={startConfigure}
                  disabled={false}
                />
              ))}
            </div>
          </div>
        ) : (
          // --- Configure / running view ---
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-mono text-xs font-semibold text-text-1">
                  {state.template.name}
                </h3>
                <p className="mt-0.5 text-[11px] leading-snug text-text-3">
                  {state.template.tagline}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setState(null)}
                disabled={running}
                className="rounded-sm border border-border-soft px-2 py-1 font-mono text-[10px] text-text-3 hover:border-border-mid hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
              >
                ← back
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label
                  className="df-label mb-1.5 block"
                  htmlFor="team-template-name"
                >
                  team name
                </label>
                <input
                  id="team-template-name"
                  type="text"
                  value={state.teamName}
                  onChange={(e) =>
                    setState((prev) =>
                      prev ? { ...prev, teamName: e.target.value } : prev
                    )
                  }
                  disabled={running}
                  autoFocus
                  className="w-full rounded-sm border border-border-mid bg-bg-1 px-2 py-1.5 font-mono text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="df-label mb-1.5 block">worktree path</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={state.worktreePath}
                    readOnly
                    placeholder="Pick a folder…"
                    className="w-full rounded-sm border border-border-mid bg-bg-1 px-2 py-1.5 font-mono text-xs text-text-1 placeholder:text-text-4 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void pickWorktree()}
                    disabled={running}
                    className="shrink-0 rounded-sm border border-border-soft bg-bg-3 px-2 py-1.5 font-mono text-[10px] text-text-2 hover:bg-bg-4 hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Pick…
                  </button>
                </div>
              </div>
            </div>

            {/* Preview of what will be created — helps the user confirm
                before committing to an IPC storm. */}
            <div className="rounded-sm border border-border-soft bg-bg-1 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="df-label">will create</span>
                <span className="font-mono text-[10px] text-text-4">
                  {state.template.agents.length} agents ·{' '}
                  {state.template.edges.length} edges · model{' '}
                  {state.template.defaultModel}
                </span>
              </div>
              <TemplatePreview template={state.template} />
            </div>

            {/* Progress bar — always rendered so the transition from
                0% to running doesn't jump the layout. */}
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-text-3">
                  {running ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2
                        size={10}
                        strokeWidth={2}
                        className="animate-spin text-accent-500"
                      />
                      {state.currentLabel || 'Working…'}
                    </span>
                  ) : (
                    <span>
                      {state.done}/{state.total} steps planned
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10px] text-text-4">
                  {progressPct}%
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-sm bg-bg-3">
                <div
                  className="h-full bg-accent-500 transition-[width] duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer — shape differs per stage. */}
        <footer className="flex items-center justify-end gap-1.5 border-t border-border-soft bg-bg-1 px-3 py-2">
          {state === null ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-border-soft px-2.5 py-1 text-[11px] text-text-2 hover:border-border-mid hover:bg-bg-3"
            >
              Close
            </button>
          ) : configuring ? (
            <>
              <button
                type="button"
                onClick={() => setState(null)}
                className="rounded-sm border border-border-soft px-2.5 py-1 text-[11px] text-text-2 hover:border-border-mid hover:bg-bg-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runProvisioning()}
                disabled={
                  state.teamName.trim().length === 0 ||
                  state.worktreePath.trim().length === 0
                }
                className="inline-flex items-center gap-1 rounded-sm bg-accent-500 px-3 py-1 text-[11px] font-semibold text-bg-0 hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Wand2 size={11} strokeWidth={2} />
                Provision team
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={cancelRunning}
              className="rounded-sm border border-red-500/50 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300 hover:border-red-500 hover:bg-red-500/20"
            >
              Cancel provisioning
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
