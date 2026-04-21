/**
 * Disk I/O for Orchestra team / agent folders.
 *
 * See PLAN.md §3 (persistence) and §6 (trigger YAML shape).
 *
 * Layout on disk (rooted at {@link orchestraRoot}):
 *
 * ```
 * orchestra/
 *   teams/
 *     <team-slug>/
 *       CLAUDE.md
 *       team.meta.json
 *       agents/
 *         <agent-slug>/
 *           soul.md
 *           skills.yaml
 *           triggers.yaml
 * ```
 *
 * Files are the source of truth (§3.3 of PLAN.md). The JSON store is a
 * write-through cache; this module is the read-through side of that split.
 */

import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import yaml from 'js-yaml'
import chokidar, { type FSWatcher } from 'chokidar'
import type { Skill, Trigger } from '../../shared/orchestra'

// ---------------------------------------------------------------------------
// Root path
// ---------------------------------------------------------------------------

const DEFAULT_ROOT = join(homedir(), '.hydra-ensemble', 'orchestra')

/**
 * Module-level override for tests. Production code never writes this; tests
 * reach it through {@link setOrchestraRootForTests}.
 */
let rootOverride: string | null = null

/** Absolute path to the Orchestra data root. */
export function orchestraRoot(): string {
  return rootOverride ?? DEFAULT_ROOT
}

/** Test-only: swap the root so unit tests can sandbox to `os.tmpdir()`. */
export function setOrchestraRootForTests(path: string | null): void {
  rootOverride = path
}

export function teamsRoot(): string {
  return join(orchestraRoot(), 'teams')
}

export function teamDir(teamSlug: string): string {
  return join(teamsRoot(), teamSlug)
}

export function agentDir(teamSlug: string, agentSlug: string): string {
  return join(teamDir(teamSlug), 'agents', agentSlug)
}

function teamClaudeMdPath(teamSlug: string): string {
  return join(teamDir(teamSlug), 'CLAUDE.md')
}

function teamMetaPath(teamSlug: string): string {
  return join(teamDir(teamSlug), 'team.meta.json')
}

function soulPath(teamSlug: string, agentSlug: string): string {
  return join(agentDir(teamSlug, agentSlug), 'soul.md')
}

function skillsPath(teamSlug: string, agentSlug: string): string {
  return join(agentDir(teamSlug, agentSlug), 'skills.yaml')
}

function triggersPath(teamSlug: string, agentSlug: string): string {
  return join(agentDir(teamSlug, agentSlug), 'triggers.yaml')
}

// ---------------------------------------------------------------------------
// Self-write suppression for the chokidar watcher
// ---------------------------------------------------------------------------

/**
 * Absolute paths we've just written. Entries expire after {@link SUPPRESS_MS}
 * so external edits made right after a write still fire the watcher.
 */
const recentWrites = new Map<string, number>()
const SUPPRESS_MS = 250

function markSelfWrite(absPath: string): void {
  recentWrites.set(absPath, Date.now())
}

function isSelfWrite(absPath: string): boolean {
  const at = recentWrites.get(absPath)
  if (at === undefined) return false
  if (Date.now() - at > SUPPRESS_MS) {
    recentWrites.delete(absPath)
    return false
  }
  return true
}

/** YAML dump options kept consistent across all writers. */
const YAML_OPTS: yaml.DumpOptions = {
  indent: 2,
  lineWidth: 100,
  noRefs: true
}

/**
 * Atomic write: writes to a sibling tmp file then renames. `rename` is
 * atomic on the same filesystem, which is enough for our use — a crash
 * mid-write leaves either the old content or the new one, never a
 * truncated file.
 */
async function atomicWrite(absPath: string, content: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true })
  const tmp = `${absPath}.${randomUUID()}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, absPath)
  markSelfWrite(absPath)
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export type AgentPreset = 'blank' | 'reviewer' | 'dev' | 'qa' | 'pm'

interface PresetContent {
  soul: string
  skills: Skill[]
  triggers: Array<Omit<Trigger, 'id'>>
}

const DEFAULT_TEAM_CLAUDE_MD =
  '# <slug> team\n\nShared instructions for every agent in this team.\n'

function renderTeamClaudeMd(teamSlug: string): string {
  return DEFAULT_TEAM_CLAUDE_MD.replace('<slug>', teamSlug)
}

function presetContent(preset: AgentPreset): PresetContent {
  switch (preset) {
    case 'blank':
      return {
        soul: '# Role\n\n<describe this agent>\n',
        skills: [],
        triggers: [{ kind: 'manual', pattern: '', priority: 0, enabled: true }]
      }

    case 'reviewer':
      return {
        soul:
          '# Role\n\nReviewer agent. Inspect diffs, call out risk, ' +
          'and suggest precise fixes without rewriting the whole thing.\n',
        skills: [
          {
            name: 'code-review',
            tags: ['review', 'diff', 'quality'],
            weight: 1.5,
            description: 'Line-level critique of staged or PR diffs.'
          },
          {
            name: 'style-guide',
            tags: ['style', 'lint', 'convention'],
            weight: 1.1,
            description: 'Cross-check changes against the team style guide.'
          },
          {
            name: 'test-coverage',
            tags: ['tests', 'coverage'],
            weight: 1.2,
            description: 'Flag missing test paths for changed public surface.'
          }
        ],
        triggers: [
          { kind: 'tag', pattern: 'review', priority: 8, enabled: true },
          {
            kind: 'path',
            pattern: '**/*.go',
            priority: 6,
            enabled: true
          },
          { kind: 'manual', pattern: '', priority: 0, enabled: true }
        ]
      }

    case 'dev':
      return {
        soul:
          '# Role\n\nDeveloper agent. Implement features end-to-end: ' +
          'domain logic, adapters, tests. Small diffs, green builds.\n',
        skills: [
          {
            name: 'feature-impl',
            tags: ['feature', 'impl'],
            weight: 1.5,
            description: 'Translate tickets into minimal, idiomatic code.'
          },
          {
            name: 'refactor',
            tags: ['refactor', 'cleanup'],
            weight: 1.2,
            description: 'Untangle code without changing behaviour.'
          },
          {
            name: 'bug-fix',
            tags: ['bug', 'fix', 'regression'],
            weight: 1.3,
            description: 'Root-cause and patch with a regression test.'
          }
        ],
        triggers: [
          { kind: 'tag', pattern: 'feature', priority: 7, enabled: true },
          { kind: 'tag', pattern: 'bug', priority: 8, enabled: true },
          { kind: 'manual', pattern: '', priority: 0, enabled: true }
        ]
      }

    case 'qa':
      return {
        soul:
          '# Role\n\nQA agent. Turn specs into test plans, add failing ' +
          'cases first, and never ship without a smoke run.\n',
        skills: [
          {
            name: 'test-plan',
            tags: ['qa', 'tests', 'coverage'],
            weight: 1.4,
            description: 'Enumerate edge cases from spec + code.'
          },
          {
            name: 'flake-hunt',
            tags: ['flake', 'ci', 'race'],
            weight: 1.3,
            description: 'Reproduce and stabilise intermittent failures.'
          },
          {
            name: 'smoke-suite',
            tags: ['smoke', 'e2e'],
            weight: 1.1,
            description: 'Maintain the golden-path end-to-end path.'
          }
        ],
        triggers: [
          { kind: 'tag', pattern: 'tests', priority: 7, enabled: true },
          { kind: 'tag', pattern: 'qa', priority: 8, enabled: true },
          {
            kind: 'path',
            pattern: '**/__tests__/**',
            priority: 6,
            enabled: true
          }
        ]
      }

    case 'pm':
      return {
        soul:
          '# Role\n\nProduct manager agent. Split big asks into tickets, ' +
          'delegate, track status, and close the loop with the human.\n',
        skills: [
          {
            name: 'task-split',
            tags: ['planning', 'split', 'scope'],
            weight: 1.5,
            description: 'Turn fuzzy goals into right-sized subtasks.'
          },
          {
            name: 'delegation',
            tags: ['delegate', 'routing'],
            weight: 1.4,
            description: 'Pick the best teammate for each subtask.'
          },
          {
            name: 'status-report',
            tags: ['status', 'report'],
            weight: 1.0,
            description: 'Summarise progress for the human stakeholder.'
          }
        ],
        triggers: [
          { kind: 'tag', pattern: 'planning', priority: 9, enabled: true },
          { kind: 'tag', pattern: 'roadmap', priority: 7, enabled: true },
          { kind: 'manual', pattern: '', priority: 0, enabled: true }
        ]
      }
  }
}

// ---------------------------------------------------------------------------
// Team / agent scaffolding
// ---------------------------------------------------------------------------

interface TeamMetaFile {
  createdAt: string
  updatedAt: string
}

/**
 * Create a fresh team folder on disk with a starter `CLAUDE.md` and a
 * `team.meta.json` holding timestamps. The canonical team record lives in
 * the JSON store; this file is only a human-readable breadcrumb.
 */
export async function createTeamFolder(teamSlug: string): Promise<void> {
  const dir = teamDir(teamSlug)
  await mkdir(join(dir, 'agents'), { recursive: true })

  await atomicWrite(teamClaudeMdPath(teamSlug), renderTeamClaudeMd(teamSlug))

  const now = new Date().toISOString()
  const meta: TeamMetaFile = { createdAt: now, updatedAt: now }
  await atomicWrite(teamMetaPath(teamSlug), JSON.stringify(meta, null, 2) + '\n')
}

/**
 * Create the three per-agent files (`soul.md`, `skills.yaml`,
 * `triggers.yaml`) populated from the chosen preset. Ids for triggers
 * are injected here so the router can rely on them from the first run.
 */
export async function createAgentFolder(
  teamSlug: string,
  agentSlug: string,
  preset: AgentPreset
): Promise<void> {
  const dir = agentDir(teamSlug, agentSlug)
  await mkdir(dir, { recursive: true })

  const content = presetContent(preset)
  const triggersWithIds: Trigger[] = content.triggers.map((t) => ({
    ...t,
    id: randomUUID()
  }))

  await atomicWrite(soulPath(teamSlug, agentSlug), content.soul)
  await atomicWrite(
    skillsPath(teamSlug, agentSlug),
    yaml.dump(content.skills, YAML_OPTS)
  )
  await atomicWrite(
    triggersPath(teamSlug, agentSlug),
    yaml.dump(triggersWithIds, YAML_OPTS)
  )
}

// ---------------------------------------------------------------------------
// soul.md
// ---------------------------------------------------------------------------

export async function readSoul(
  teamSlug: string,
  agentSlug: string
): Promise<string> {
  return readFile(soulPath(teamSlug, agentSlug), 'utf8')
}

export async function writeSoul(
  teamSlug: string,
  agentSlug: string,
  text: string
): Promise<void> {
  await atomicWrite(soulPath(teamSlug, agentSlug), text)
}

// ---------------------------------------------------------------------------
// skills.yaml
// ---------------------------------------------------------------------------

function isSkillShape(v: unknown): v is Skill {
  if (v === null || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  if (typeof r.name !== 'string') return false
  if (typeof r.weight !== 'number') return false
  if (!Array.isArray(r.tags) || !r.tags.every((t) => typeof t === 'string')) {
    return false
  }
  if (r.description !== undefined && typeof r.description !== 'string') {
    return false
  }
  return true
}

export async function readSkills(
  teamSlug: string,
  agentSlug: string
): Promise<Skill[]> {
  const raw = await readFile(skillsPath(teamSlug, agentSlug), 'utf8')
  // yaml.load intentionally bubbles YAMLException — callers can surface
  // parse errors to the UI.
  const parsed = yaml.load(raw)
  if (parsed == null) return []
  if (!Array.isArray(parsed)) {
    throw new Error(`skills.yaml must be a list, got ${typeof parsed}`)
  }
  const out: Skill[] = []
  for (const entry of parsed) {
    if (!isSkillShape(entry)) {
      throw new Error(`skills.yaml contains a malformed entry: ${JSON.stringify(entry)}`)
    }
    out.push(entry)
  }
  return out
}

export async function writeSkills(
  teamSlug: string,
  agentSlug: string,
  skills: Skill[]
): Promise<void> {
  await atomicWrite(
    skillsPath(teamSlug, agentSlug),
    yaml.dump(skills, YAML_OPTS)
  )
}

// ---------------------------------------------------------------------------
// triggers.yaml
// ---------------------------------------------------------------------------

const TRIGGER_KINDS = new Set(['manual', 'tag', 'path', 'event', 'schedule'])

/**
 * Shape check for trigger entries read back from YAML. Missing `id` is
 * tolerated here — {@link readTriggers} injects a new id and re-writes the
 * file, so a freshly-edited `triggers.yaml` without ids is still valid
 * input.
 */
function isTriggerShape(v: unknown): v is Omit<Trigger, 'id'> & { id?: unknown } {
  if (v === null || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  if (typeof r.kind !== 'string' || !TRIGGER_KINDS.has(r.kind)) return false
  if (typeof r.pattern !== 'string') return false
  if (typeof r.priority !== 'number') return false
  if (typeof r.enabled !== 'boolean') return false
  if (r.when !== undefined && typeof r.when !== 'string') return false
  return true
}

/**
 * Parse `triggers.yaml`, injecting missing ids with `crypto.randomUUID()`.
 * When any id was injected, persist the file back so downstream callers
 * (router, inspector) see stable ids from here on.
 */
export async function readTriggers(
  teamSlug: string,
  agentSlug: string
): Promise<Trigger[]> {
  const file = triggersPath(teamSlug, agentSlug)
  const raw = await readFile(file, 'utf8')
  const parsed = yaml.load(raw)
  if (parsed == null) return []
  if (!Array.isArray(parsed)) {
    throw new Error(`triggers.yaml must be a list, got ${typeof parsed}`)
  }

  let mutated = false
  const out: Trigger[] = []
  for (const entry of parsed) {
    if (!isTriggerShape(entry)) {
      throw new Error(
        `triggers.yaml contains a malformed entry: ${JSON.stringify(entry)}`
      )
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      mutated = true
      out.push({
        id: randomUUID(),
        kind: entry.kind,
        pattern: entry.pattern,
        priority: entry.priority,
        enabled: entry.enabled,
        ...(entry.when !== undefined ? { when: entry.when } : {})
      })
    } else {
      out.push({
        id: entry.id,
        kind: entry.kind,
        pattern: entry.pattern,
        priority: entry.priority,
        enabled: entry.enabled,
        ...(entry.when !== undefined ? { when: entry.when } : {})
      })
    }
  }

  if (mutated) {
    await atomicWrite(file, yaml.dump(out, YAML_OPTS))
  }
  return out
}

export async function writeTriggers(
  teamSlug: string,
  agentSlug: string,
  triggers: Trigger[]
): Promise<void> {
  await atomicWrite(
    triggersPath(teamSlug, agentSlug),
    yaml.dump(triggers, YAML_OPTS)
  )
}

// ---------------------------------------------------------------------------
// team CLAUDE.md
// ---------------------------------------------------------------------------

export async function readTeamClaudeMd(teamSlug: string): Promise<string> {
  return readFile(teamClaudeMdPath(teamSlug), 'utf8')
}

export async function writeTeamClaudeMd(
  teamSlug: string,
  text: string
): Promise<void> {
  await atomicWrite(teamClaudeMdPath(teamSlug), text)
}

// ---------------------------------------------------------------------------
// Teardown (with a mandatory inside-root safety check)
// ---------------------------------------------------------------------------

/**
 * Refuse to delete anything whose resolved absolute path does not sit
 * under {@link orchestraRoot}. Protects against slug strings such as
 * `../../etc` or an empty slug that would collapse to the root.
 */
function assertInsideRoot(absPath: string): void {
  const root = resolve(orchestraRoot())
  const target = resolve(absPath)
  if (target === root) {
    throw new Error(`refusing to delete orchestra root itself: ${target}`)
  }
  const prefix = root.endsWith(sep) ? root : root + sep
  if (!target.startsWith(prefix)) {
    throw new Error(
      `refusing to delete path outside orchestra root: ${target} (root: ${root})`
    )
  }
}

export async function deleteTeamFolder(teamSlug: string): Promise<void> {
  const dir = teamDir(teamSlug)
  assertInsideRoot(dir)
  await rm(dir, { recursive: true, force: true })
}

export async function deleteAgentFolder(
  teamSlug: string,
  agentSlug: string
): Promise<void> {
  const dir = agentDir(teamSlug, agentSlug)
  assertInsideRoot(dir)
  await rm(dir, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// Watcher
// ---------------------------------------------------------------------------

export type WatchEventKind = 'soul' | 'skills' | 'triggers' | 'claude_md'

export interface WatchEvent {
  kind: WatchEventKind
  teamSlug: string
  agentSlug?: string
}

/**
 * Classify a path inside `teams/` into a {@link WatchEvent}. Returns null
 * when the path is not one of the four tracked files.
 */
function classifyPath(absPath: string): WatchEvent | null {
  const root = resolve(teamsRoot())
  const rel = resolve(absPath).slice(root.length + 1)
  if (rel.length === 0) return null
  const parts = rel.split(sep)
  const teamSlug = parts[0]
  if (!teamSlug) return null

  // teams/<team>/CLAUDE.md
  if (parts.length === 2 && parts[1] === 'CLAUDE.md') {
    return { kind: 'claude_md', teamSlug }
  }

  // teams/<team>/agents/<agent>/<file>
  if (parts.length === 4 && parts[1] === 'agents') {
    const agentSlug = parts[2]
    const file = parts[3]
    if (!agentSlug || !file) return null
    if (file === 'soul.md') return { kind: 'soul', teamSlug, agentSlug }
    if (file === 'skills.yaml') return { kind: 'skills', teamSlug, agentSlug }
    if (file === 'triggers.yaml') {
      return { kind: 'triggers', teamSlug, agentSlug }
    }
  }
  return null
}

/**
 * Watch `teams/` recursively and fire `onChange` whenever one of the
 * tracked files changes externally. Self-writes (performed through any
 * `write*` function in this module within the last 250ms) are suppressed
 * so the UI doesn't bounce back and forth on its own edits.
 */
export function watchTeams(onChange: (event: WatchEvent) => void): () => void {
  const root = teamsRoot()
  // `ignoreInitial: true` — we care about changes, not the initial scan.
  const watcher: FSWatcher = chokidar.watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 50,
      pollInterval: 20
    }
  })

  const handle = (absPath: string): void => {
    if (isSelfWrite(absPath)) return
    const ev = classifyPath(absPath)
    if (ev) onChange(ev)
  }

  watcher.on('add', handle)
  watcher.on('change', handle)
  watcher.on('unlink', handle)

  return () => {
    void watcher.close()
  }
}
