/**
 * Team export / import — serializes a whole Orchestra topology (team +
 * agents + reporting edges + each agent's soul.md / skills.yaml /
 * triggers.yaml) into a plain JSON document and restores it on the other
 * side.
 *
 * Design notes
 * ------------
 * - Pure logic. No JSX, no DOM. The caller is responsible for triggering
 *   the download (Blob + URL.createObjectURL) or feeding the parsed JSON
 *   back into {@link importTeamFromJson}.
 * - Edges are serialized by agent **slug** rather than UUID. UUIDs are
 *   regenerated on the target machine, so slugs are the only stable
 *   identity we can carry across the wire.
 * - On import we use `preset: 'blank'` so the disk scaffolder doesn't
 *   inject default soul/skills/triggers that we'd immediately overwrite.
 *   Then we call the write* IPC methods with the exported contents so the
 *   restored agent is byte-identical to the source.
 * - Individual file I/O failures are collected rather than aborted so a
 *   corrupted skills file on one agent doesn't leave a half-imported team
 *   behind silently. We throw at the end with a joined message; the caller
 *   can surface it via toast.
 */
import type {
  DelegationMode,
  SafeMode,
  Skill,
  Trigger,
  UUID
} from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'

/** JSON schema version shipped today. Bump when the payload shape changes
 *  in a way older consumers can't read. */
const EXPORT_VERSION = 1 as const

export interface ExportedTeam {
  version: 1
  name: string
  safeMode: SafeMode
  defaultModel: string
  agents: Array<{
    name: string
    slug: string
    role: string
    description: string
    position: { x: number; y: number }
    color?: string
    model: string
    maxTokens: number
    soul: string
    skills: Skill[]
    triggers: Trigger[]
  }>
  edges: Array<{ parent: string; child: string; delegationMode: DelegationMode }>
  exportedAt: string
}

/** Resolve the preload namespace once per call. Exported helpers refuse
 *  to run without it rather than degrading silently — the caller should
 *  toast "file I/O not wired". */
function requireAgentApi(): NonNullable<Window['api']['orchestra']>['agent'] {
  const agent = window.api?.orchestra?.agent
  if (!agent) throw new Error('orchestra api not available')
  return agent
}

/** Unwrap an OrchestraResult<T> or throw with its error string. */
async function unwrap<T>(
  p: Promise<{ ok: true; value: T } | { ok: false; error: string }>
): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error)
  return res.value
}

/**
 * Snapshot the active team's topology into a plain object suitable for
 * JSON.stringify. Reads the three on-disk files per agent so the payload
 * is self-contained — no follow-up IPC required to reproduce the team.
 */
export async function exportActiveTeam(teamId: UUID): Promise<ExportedTeam> {
  const state = useOrchestra.getState()
  const team = state.teams.find((t) => t.id === teamId)
  if (!team) throw new Error(`team not found: ${teamId}`)

  const agents = state.agents.filter((a) => a.teamId === teamId)
  const edges = state.edges.filter((e) => e.teamId === teamId)

  const agentApi = requireAgentApi()

  const errors: string[] = []
  const slugByAgentId = new Map<string, string>()
  agents.forEach((a) => slugByAgentId.set(a.id, a.slug))

  const exportedAgents: ExportedTeam['agents'] = await Promise.all(
    agents.map(async (a) => {
      // Each file read is individually guarded; if soul fails we still
      // try skills and triggers so the error message lists every missing
      // piece in one go.
      let soul = ''
      let skills: Skill[] = []
      let triggers: Trigger[] = []

      try {
        soul = await unwrap<string>(agentApi.readSoul(a.id))
      } catch (err) {
        errors.push(`readSoul(${a.slug}): ${(err as Error).message}`)
      }
      try {
        skills = await unwrap<Skill[]>(
          agentApi.readSkills(a.id) as Promise<
            { ok: true; value: Skill[] } | { ok: false; error: string }
          >
        )
      } catch (err) {
        errors.push(`readSkills(${a.slug}): ${(err as Error).message}`)
      }
      try {
        triggers = await unwrap<Trigger[]>(
          agentApi.readTriggers(a.id) as Promise<
            { ok: true; value: Trigger[] } | { ok: false; error: string }
          >
        )
      } catch (err) {
        errors.push(`readTriggers(${a.slug}): ${(err as Error).message}`)
      }

      return {
        name: a.name,
        slug: a.slug,
        role: a.role,
        description: a.description,
        position: { x: a.position.x, y: a.position.y },
        color: a.color,
        model: a.model,
        maxTokens: a.maxTokens,
        soul,
        skills,
        triggers
      }
    })
  )

  if (errors.length > 0) {
    throw new Error(`export failed: ${errors.join('; ')}`)
  }

  const exportedEdges: ExportedTeam['edges'] = edges.flatMap((e) => {
    const parent = slugByAgentId.get(e.parentAgentId)
    const child = slugByAgentId.get(e.childAgentId)
    if (!parent || !child) {
      // Orphaned edge (agent mirror slice missed a delete) — log and drop
      // rather than export a dangling reference.
      console.warn('exportActiveTeam: skipping edge with unknown endpoint', e)
      return []
    }
    return [{ parent, child, delegationMode: e.delegationMode }]
  })

  return {
    version: EXPORT_VERSION,
    name: team.name,
    safeMode: team.safeMode,
    defaultModel: team.defaultModel,
    agents: exportedAgents,
    edges: exportedEdges,
    exportedAt: new Date().toISOString()
  }
}

/**
 * Restore a team from a previously exported JSON document. Creates a new
 * team (fresh UUIDs everywhere), provisions blank agents, overwrites their
 * scaffolded files with the exported contents, then re-links the edges
 * using the slug→newId map.
 *
 * The `name` override lets the caller import a team multiple times without
 * colliding on the auto-generated slug — useful for templating workflows.
 */
export async function importTeamFromJson(
  json: ExportedTeam,
  opts: { name?: string; worktreePath: string }
): Promise<{ teamId: UUID; agentIds: string[] }> {
  if (json.version !== EXPORT_VERSION) {
    throw new Error(`invalid export: version ${json.version}`)
  }

  const store = useOrchestra.getState()
  const agentApi = requireAgentApi()

  const team = await store.createTeam({
    name: opts.name ?? json.name,
    worktreePath: opts.worktreePath,
    safeMode: json.safeMode,
    defaultModel: json.defaultModel
  })
  if (!team) throw new Error('import failed: createTeam returned null')

  const errors: string[] = []
  const slugMap = new Map<string, string>()
  const agentIds: string[] = []

  for (const exported of json.agents) {
    const created = await useOrchestra.getState().createAgent({
      teamId: team.id,
      position: { x: exported.position.x, y: exported.position.y },
      name: exported.name,
      role: exported.role,
      description: exported.description,
      color: exported.color,
      model: exported.model,
      preset: 'blank'
    })
    if (!created) {
      errors.push(`createAgent(${exported.slug}): returned null`)
      continue
    }

    slugMap.set(exported.slug, created.id)
    agentIds.push(created.id)

    // Overwrite the blank preset files with the exported contents. Each
    // write is guarded independently so a single corrupt field doesn't
    // strand the rest of the team half-imported.
    try {
      await unwrap<void>(agentApi.writeSoul(created.id, exported.soul))
    } catch (err) {
      errors.push(`writeSoul(${exported.slug}): ${(err as Error).message}`)
    }
    try {
      await unwrap<void>(
        agentApi.writeSkills(created.id, exported.skills) as Promise<
          { ok: true; value: void } | { ok: false; error: string }
        >
      )
    } catch (err) {
      errors.push(`writeSkills(${exported.slug}): ${(err as Error).message}`)
    }
    try {
      await unwrap<void>(
        agentApi.writeTriggers(created.id, exported.triggers) as Promise<
          { ok: true; value: void } | { ok: false; error: string }
        >
      )
    } catch (err) {
      errors.push(`writeTriggers(${exported.slug}): ${(err as Error).message}`)
    }
  }

  for (const edge of json.edges) {
    const parentId = slugMap.get(edge.parent)
    const childId = slugMap.get(edge.child)
    if (!parentId || !childId) {
      // Tampered export or agent that failed to create above — drop it
      // rather than fabricate a bogus edge.
      console.warn('importTeamFromJson: skipping edge with unknown slug', edge)
      continue
    }
    const createdEdge = await useOrchestra.getState().createEdge({
      teamId: team.id,
      parentAgentId: parentId,
      childAgentId: childId,
      delegationMode: edge.delegationMode
    })
    if (!createdEdge) {
      errors.push(
        `createEdge(${edge.parent}->${edge.child}): returned null`
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(`import failed: ${errors.join('; ')}`)
  }

  return { teamId: team.id, agentIds }
}
