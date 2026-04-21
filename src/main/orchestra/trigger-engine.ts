/**
 * Trigger Engine — matches triggers against tasks and computes routing scores.
 *
 * See PLAN.md §6 for matching rules and §6.3 for the scoring formula.
 *
 * MVP caveats:
 * - `event` and `schedule` triggers are shape-only: `matches` always returns
 *   false and the score contribution is 0. A one-time `console.debug` warning
 *   is logged the first time either kind is encountered per process.
 * - `path` matching only looks at candidate paths explicitly listed after
 *   `path:` tokens in the task body, plus bare repo-rooted tokens such as
 *   `src/...`, `internal/...`, `pkg/...`, `cmd/...`, `app/...`, `test/...`.
 *   Proper multi-source path extraction is deferred to v2 per PLAN §6.2.
 */

import type { Agent, Skill, Task, Trigger } from '../../shared/orchestra'

export interface ScoreContext {
  agent: Agent
  task: Task
  skills: Skill[]
  now?: Date
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the trigger's matching rule fires for the given task.
 * Manual triggers are considered matching when the task has any assignee —
 * the stricter `assignedAgentId === ctx.agent.id` check lives in
 * `scoreForTrigger` since it requires the agent context.
 */
export function matches(trigger: Trigger, task: Task): boolean {
  switch (trigger.kind) {
    case 'manual':
      return task.assignedAgentId !== null
    case 'tag':
      return matchesTag(trigger.pattern, task.tags)
    case 'path':
      return matchesPath(trigger.pattern, task.body)
    case 'event':
    case 'schedule':
      warnShapeOnly()
      return false
    default:
      return false
  }
}

/**
 * Score a single trigger against the context. Disabled triggers short-circuit
 * to 0 without running the matcher. See PLAN.md §6.3.
 */
export function scoreForTrigger(trigger: Trigger, ctx: ScoreContext): number {
  if (trigger.enabled === false) return 0

  // Shape-only kinds: 0 without consulting the matcher beyond the one-shot warn.
  if (trigger.kind === 'event' || trigger.kind === 'schedule') {
    warnShapeOnly()
    return 0
  }

  const didMatch =
    trigger.kind === 'manual'
      ? ctx.task.assignedAgentId === ctx.agent.id
      : matches(trigger, ctx.task)

  const base = didMatch ? trigger.priority : 0
  const boost = skillBoost(ctx.skills, ctx.task.tags)
  const penalty = recencyPenalty(ctx.agent, ctx.now ?? new Date())
  return base + boost + penalty
}

/**
 * Score an agent as a routing candidate by evaluating all its triggers and
 * picking the best one. Returns aggregated score and which trigger ids fired.
 * `matchedTriggerIds` is sorted descending by per-trigger score.
 */
export function scoreForAgent(
  triggers: Trigger[],
  ctx: ScoreContext
): { score: number; matchedTriggerIds: string[] } {
  const scored: Array<{ id: string; score: number }> = []
  let best = 0

  for (const t of triggers) {
    if (t.enabled === false) continue
    const s = scoreForTrigger(t, ctx)
    if (s > 0) scored.push({ id: t.id, score: s })
    if (s > best) best = s
  }

  scored.sort((a, b) => b.score - a.score)
  return { score: best, matchedTriggerIds: scored.map((x) => x.id) }
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function matchesTag(pattern: string, tags: string[]): boolean {
  const needle = pattern.trim().toLowerCase()
  if (!needle) return false
  return tags.some((t) => t.trim().toLowerCase() === needle)
}

/**
 * Case-sensitive glob match — paths are case-sensitive on Unix and we do not
 * need case folding for Go/TS monorepo roots.
 */
function matchesPath(pattern: string, body: string): boolean {
  if (!pattern.trim()) return false
  const re = globToRegex(pattern)
  const candidates = extractCandidatePaths(body)
  return candidates.some((p) => re.test(p))
}

/**
 * Pull candidate paths out of a task body. Two sources per PLAN §6.2:
 *  1. `path: <value>` tokens — explicit user hints.
 *  2. Bare repo-rooted paths starting with common roots (`src/`, `internal/`,
 *     `pkg/`, `cmd/`, `app/`, `test/`, `tests/`).
 * Deduplicated, order preserved.
 */
function extractCandidatePaths(body: string): string[] {
  const out = new Set<string>()

  // `path: something/foo.go` — stop at whitespace, comma, semicolon, quote, backtick.
  const explicit = /(?:^|[\s(])path\s*:\s*([^\s,;'"`)]+)/gi
  for (const m of body.matchAll(explicit)) {
    if (m[1]) out.add(m[1])
  }

  // Bare repo-rooted tokens.
  const rooted = /(?:^|[\s(`'"])((?:src|internal|pkg|cmd|app|tests?)\/[^\s,;'"`)]+)/g
  for (const m of body.matchAll(rooted)) {
    if (m[1]) out.add(m[1])
  }

  return Array.from(out)
}

/**
 * Tiny glob-to-regex. Supports `**` (any, including separators), `*` (any
 * except `/`), and `?` (single non-separator). Everything else is escaped.
 * We avoid adding `minimatch` as a dep per task instructions.
 */
function globToRegex(glob: string): RegExp {
  let src = '^'
  for (let i = 0; i < glob.length; i++) {
    const c: string = glob.charAt(i)
    if (c === '*' && glob.charAt(i + 1) === '*') {
      src += '.*'
      i++
    } else if (c === '*') {
      src += '[^/]*'
    } else if (c === '?') {
      src += '[^/]'
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      src += '\\' + c
    } else {
      src += c
    }
  }
  src += '$'
  return new RegExp(src)
}

// ---------------------------------------------------------------------------
// Score modifiers
// ---------------------------------------------------------------------------

function skillBoost(skills: Skill[], taskTags: string[]): number {
  if (!skills.length || !taskTags.length) return 0
  const tagSet = new Set(taskTags.map((t) => t.toLowerCase()))
  let sum = 0
  for (const s of skills) {
    if (s.tags.some((t) => tagSet.has(t.toLowerCase()))) sum += s.weight
  }
  return sum
}

function recencyPenalty(agent: Agent, now: Date): number {
  if (!agent.lastActiveAt) return 0
  const last = new Date(agent.lastActiveAt).getTime()
  if (!Number.isFinite(last)) return 0
  const minutes = Math.max(0, (now.getTime() - last) / 60_000)
  const penalty = -0.5 * (minutes / 60)
  return Math.max(-3, penalty)
}

// ---------------------------------------------------------------------------
// Warning suppression — MVP event/schedule kinds
// ---------------------------------------------------------------------------

let warnedShapeOnly = false
function warnShapeOnly(): void {
  if (warnedShapeOnly) return
  warnedShapeOnly = true
  // eslint-disable-next-line no-console
  console.debug('event triggers are shape-only in MVP')
}

/** Test-only: reset the one-shot warn flag so suites can assert the warning. */
export function __resetShapeOnlyWarning(): void {
  warnedShapeOnly = false
}
