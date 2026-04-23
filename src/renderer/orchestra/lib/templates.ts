/**
 * Team templates — ready-made agent graphs that provision a whole team
 * (agents + reporting edges) in one click.
 *
 * This module is purely declarative data + two small helpers that turn a
 * template into the concrete `NewAgentInput` / `NewEdgeInput` payloads the
 * main process expects. No IPC here — the dialog component drives the
 * provisioning flow and feeds the helpers.
 *
 * Layout model
 * ------------
 * Each `TemplateAgentDraft` carries `row` / `col` grid coordinates (0-based)
 * that describe where the card should land on the team canvas relative to
 * other cards in the same template. The concrete `position.x` /
 * `position.y` are computed at provisioning time by multiplying by
 * `LAYOUT_GRID.x` / `LAYOUT_GRID.y`. Fractional `col` values are allowed
 * (e.g. 0.5, 1.5) so two children of a single parent can be centred under
 * it without introducing a separate offset field.
 *
 * Edge resolution
 * ---------------
 * Edges reference agents by `parentSlugOrName` / `childSlugOrName` — the
 * dialog matches these against the names of the agents returned by
 * `createAgent` (case-insensitive exact match, slug fallback). We avoid
 * referencing by array index so the template remains readable and robust
 * against reordering.
 */
import type { NewAgentInput, NewEdgeInput } from '../../../shared/orchestra'

/** Omit the fields that only make sense once a team exists. Templates
 *  don't know the `teamId` or absolute `position` — those are supplied at
 *  provisioning time. */
export interface TemplateAgentDraft
  extends Omit<NewAgentInput, 'teamId' | 'position'> {
  // grid coords in "rows / cols" relative to the team canvas; concrete
  // position is computed at provisioning time.
  row: number
  col: number
}

export interface TemplateEdgeDraft {
  parentSlugOrName: string
  childSlugOrName: string
}

export interface TeamTemplate {
  id: string
  name: string
  tagline: string
  defaultSafeMode: 'strict' | 'prompt' | 'yolo'
  defaultModel: string
  agents: TemplateAgentDraft[]
  edges: TemplateEdgeDraft[]
}

/** Offset between cards in the generated layout (px). Mirrors the canvas
 *  card footprint closely enough that templated teams don't overlap — if
 *  AgentCard grows, bump these numbers. */
export const LAYOUT_GRID = { x: 260, y: 200 } as const

// ---------------------------------------------------------------------------
// Concrete templates
// ---------------------------------------------------------------------------

const PR_REVIEW_SWARM: TeamTemplate = {
  id: 'pr-review-swarm',
  name: 'PR review swarm',
  tagline:
    'A PM-style reviewer that fans work out to 3 specialists: lint, security, and test gaps.',
  defaultSafeMode: 'prompt',
  defaultModel: 'claude-sonnet-4-6',
  agents: [
    {
      // Row 0 — PM sits above the specialists, centred across a 3-wide row
      // (cols 0, 1, 2 → centre at 1).
      name: 'Reviewer PM',
      role: 'PR review coordinator',
      description:
        'Orchestrates PR reviews. Splits work between the lint, security, and test-gap specialists; summarises their findings into a single comment thread.',
      preset: 'pm',
      row: 0,
      col: 1
    },
    {
      name: 'Go Lint Reviewer',
      role: 'Static analysis & style',
      description:
        'Runs golangci-lint mentally: formatting, idiomatic Go, error wrapping, context usage, naming, package boundaries.',
      preset: 'reviewer',
      row: 1,
      col: 0
    },
    {
      name: 'Security Audit',
      role: 'Security reviewer',
      description:
        'Looks for injection, unsafe deserialization, missing HMAC, leaked secrets, PII in logs, and missing authz checks.',
      preset: 'reviewer',
      row: 1,
      col: 1
    },
    {
      name: 'Test Gap Finder',
      role: 'Coverage & edge cases',
      description:
        'Spots missing tests: happy path without error paths, concurrent access without -race, missing table-driven cases, untested state transitions.',
      preset: 'reviewer',
      row: 1,
      col: 2
    }
  ],
  edges: [
    { parentSlugOrName: 'Reviewer PM', childSlugOrName: 'Go Lint Reviewer' },
    { parentSlugOrName: 'Reviewer PM', childSlugOrName: 'Security Audit' },
    { parentSlugOrName: 'Reviewer PM', childSlugOrName: 'Test Gap Finder' }
  ]
}

const FEATURE_FACTORY: TeamTemplate = {
  id: 'feature-factory',
  name: 'Feature factory',
  tagline:
    'PM → Architect → Backend + Frontend → QA. A four-layer pipeline for shipping well-scoped features end to end.',
  defaultSafeMode: 'prompt',
  defaultModel: 'claude-opus-4-7',
  agents: [
    {
      // Row 0 — PM, centred across a 2-wide row of devs below (cols 0, 1
      // → centre at 0.5).
      name: 'Feature PM',
      role: 'Feature owner',
      description:
        'Owns the ticket. Clarifies scope, writes the acceptance criteria, hands the design to the architect.',
      preset: 'pm',
      row: 0,
      col: 0.5
    },
    {
      // Row 1 — Architect, same centring as PM.
      name: 'Architect',
      role: 'Technical design',
      description:
        'Designs the contract: domain model changes, new endpoints, event shape, migration plan. Splits backend and frontend work cleanly.',
      preset: 'dev',
      row: 1,
      col: 0.5
    },
    {
      // Row 2 — backend dev (left), frontend dev (right).
      name: 'Backend Dev',
      role: 'Go implementation',
      description:
        'Implements the backend slice: aggregate, use case, repository, gRPC handler, migration. Writes unit tests in the same package.',
      preset: 'dev',
      row: 2,
      col: 0
    },
    {
      name: 'Frontend Dev',
      role: 'React implementation',
      description:
        'Implements the UI: components, RTK Query hooks, form validation, optimistic updates, error boundaries.',
      preset: 'dev',
      row: 2,
      col: 1
    },
    {
      // Row 3 — QA, centred under the pair of devs.
      name: 'QA',
      role: 'Quality gate',
      description:
        'End-to-end verification: acceptance criteria, integration tests, regressions, accessibility, race conditions.',
      preset: 'qa',
      row: 3,
      col: 0.5
    }
  ],
  edges: [
    { parentSlugOrName: 'Feature PM', childSlugOrName: 'Architect' },
    { parentSlugOrName: 'Architect', childSlugOrName: 'Backend Dev' },
    { parentSlugOrName: 'Architect', childSlugOrName: 'Frontend Dev' },
    { parentSlugOrName: 'Backend Dev', childSlugOrName: 'QA' },
    { parentSlugOrName: 'Frontend Dev', childSlugOrName: 'QA' }
  ]
}

const BUG_TRIAGE: TeamTemplate = {
  id: 'bug-triage',
  name: 'Bug triage',
  tagline:
    'A triage lead that routes incoming reports to backend or frontend debuggers. Strict safe mode — no surprises on production bugs.',
  defaultSafeMode: 'strict',
  defaultModel: 'claude-sonnet-4-6',
  agents: [
    {
      // Row 0 — triage lead, centred above two debuggers.
      name: 'Triage',
      role: 'Incident triage',
      description:
        'Reads the bug report, reproduces when possible, classifies severity, routes to the right debugger, and follows up with the reporter.',
      preset: 'pm',
      row: 0,
      col: 0.5
    },
    {
      name: 'Backend Debugger',
      role: 'Go / infra debugger',
      description:
        'Investigates server-side failures: panics, DB errors, race conditions, timeout chains, wrong state transitions, outbox misses.',
      preset: 'dev',
      row: 1,
      col: 0
    },
    {
      name: 'Frontend Debugger',
      role: 'React / UI debugger',
      description:
        'Investigates client-side failures: broken renders, stale cache, RTK Query invalidation bugs, form regressions, console errors.',
      preset: 'dev',
      row: 1,
      col: 1
    }
  ],
  edges: [
    { parentSlugOrName: 'Triage', childSlugOrName: 'Backend Debugger' },
    { parentSlugOrName: 'Triage', childSlugOrName: 'Frontend Debugger' }
  ]
}

export const TEAM_TEMPLATES: readonly TeamTemplate[] = [
  PR_REVIEW_SWARM,
  FEATURE_FACTORY,
  BUG_TRIAGE
] as const

// ---------------------------------------------------------------------------
// Provisioning helpers
// ---------------------------------------------------------------------------

/** Slugify the same way the main process does for agent/team names, so our
 *  edge resolution fallback matches what the backend actually stored. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Turn a template into the payload shape that `orchestra.createAgent`
 * expects, plus a stable `localKey` the caller can use to map
 * draft-to-real-UUID once the IPC returns.
 *
 * The `teamId` is left as an empty string on purpose — the caller (the
 * dialog) must splice the freshly-created team id in before calling the
 * store. This keeps `materializeAgentDrafts` a pure function that doesn't
 * need to know about zustand or IPC.
 */
export function materializeAgentDrafts(
  template: TeamTemplate
): Array<NewAgentInput & { localKey: string }> {
  return template.agents.map((draft) => {
    const { row, col, ...rest } = draft
    return {
      ...rest,
      teamId: '', // patched by the dialog once the team exists
      position: {
        x: Math.round(col * LAYOUT_GRID.x),
        y: Math.round(row * LAYOUT_GRID.y)
      },
      localKey: slugify(draft.name)
    }
  })
}

/**
 * Resolve edge drafts against the concrete `localKey → real UUID` map the
 * dialog built after `createAgent` returned. Anything that fails to resolve
 * is silently dropped — the dialog will report the overall edge count
 * anyway, and a dangling edge is strictly worse than no edge at all.
 */
export function materializeEdgeDrafts(
  template: TeamTemplate,
  agentIdByKey: Record<string, string>
): NewEdgeInput[] {
  // Also index by lowercased name so a draft written as "Reviewer PM" can
  // still resolve when the caller keyed the map by slug ("reviewer-pm").
  // We index both variants so the caller can pass either.
  const resolve = (slugOrName: string): string | null => {
    const direct = agentIdByKey[slugOrName]
    if (direct) return direct
    const slug = slugify(slugOrName)
    const bySlug = agentIdByKey[slug]
    if (bySlug) return bySlug
    // Fallback: case-insensitive scan of the keys.
    const lower = slugOrName.toLowerCase()
    for (const [key, value] of Object.entries(agentIdByKey)) {
      if (key.toLowerCase() === lower) return value
    }
    return null
  }

  const edges: NewEdgeInput[] = []
  for (const draft of template.edges) {
    const parent = resolve(draft.parentSlugOrName)
    const child = resolve(draft.childSlugOrName)
    if (!parent || !child) continue
    edges.push({
      teamId: '', // patched by the dialog
      parentAgentId: parent,
      childAgentId: child,
      delegationMode: 'auto'
    })
  }
  return edges
}
