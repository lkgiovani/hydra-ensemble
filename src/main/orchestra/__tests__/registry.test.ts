import { describe, expect, it } from 'vitest'
import {
  OrchestraRegistry,
  createMemoryOrchestraStore,
  slugify
} from '../registry'
import type { NewAgentInput, Team } from '../../../shared/orchestra'

function makeRegistry(): OrchestraRegistry {
  return new OrchestraRegistry(createMemoryOrchestraStore())
}

function seedTeam(reg: OrchestraRegistry, name = 'Acme'): Team {
  return reg.createTeam({
    name,
    worktreePath: '/tmp/acme',
    safeMode: 'prompt',
    defaultModel: 'claude-opus-4-7'
  })
}

function agentInput(teamId: string, name: string, role = 'eng'): NewAgentInput {
  return {
    teamId,
    position: { x: 0, y: 0 },
    name,
    role
  }
}

describe('slugify', () => {
  it('kebab-cases and disambiguates collisions', () => {
    expect(slugify('Hello World', [])).toBe('hello-world')
    expect(slugify('Hello World', ['hello-world'])).toBe('hello-world-2')
    expect(slugify('Hello World', ['hello-world', 'hello-world-2'])).toBe(
      'hello-world-3'
    )
  })
})

describe('OrchestraRegistry — teams', () => {
  it('createTeam with empty name throws', () => {
    const reg = makeRegistry()
    expect(() => reg.createTeam({ name: '   ', worktreePath: '/tmp' })).toThrow(
      /empty name/
    )
  })

  it('two teams with the same name get disambiguated slugs', () => {
    const reg = makeRegistry()
    const a = reg.createTeam({ name: 'Squad', worktreePath: '/tmp/a' })
    const b = reg.createTeam({ name: 'Squad', worktreePath: '/tmp/b' })
    expect(a.slug).toBe('squad')
    expect(b.slug).toBe('squad-2')
  })

  it('deleteTeam cascades agents and edges', () => {
    const reg = makeRegistry()
    const team = seedTeam(reg)
    const a1 = reg.createAgent(agentInput(team.id, 'A1'))
    const a2 = reg.createAgent(agentInput(team.id, 'A2'))
    reg.createEdge({
      teamId: team.id,
      parentAgentId: a1.id,
      childAgentId: a2.id
    })

    // Another team untouched.
    const other = reg.createTeam({ name: 'Other', worktreePath: '/tmp/other' })
    const o1 = reg.createAgent(agentInput(other.id, 'O1'))

    reg.deleteTeam(team.id)

    expect(reg.getTeam(team.id)).toBeUndefined()
    expect(reg.listAgents(team.id)).toHaveLength(0)
    expect(reg.listEdges(team.id)).toHaveLength(0)
    expect(reg.getAgent(o1.id)).toBeDefined()
  })
})

describe('OrchestraRegistry — agents', () => {
  it('first agent is auto-promoted to main, second is not', () => {
    const reg = makeRegistry()
    const team = seedTeam(reg)
    expect(reg.getTeam(team.id)?.mainAgentId).toBeNull()

    const first = reg.createAgent(agentInput(team.id, 'First'))
    expect(reg.getTeam(team.id)?.mainAgentId).toBe(first.id)

    const second = reg.createAgent(agentInput(team.id, 'Second'))
    expect(reg.getTeam(team.id)?.mainAgentId).toBe(first.id)
    expect(second.id).not.toBe(first.id)
  })

  it('deleting the main agent reassigns to next-oldest by createdAt', async () => {
    const reg = makeRegistry()
    const team = seedTeam(reg)
    const a1 = reg.createAgent(agentInput(team.id, 'A1'))
    // Strictly increasing timestamps even on coarse clocks.
    await new Promise((r) => setTimeout(r, 5))
    const a2 = reg.createAgent(agentInput(team.id, 'A2'))
    await new Promise((r) => setTimeout(r, 5))
    const a3 = reg.createAgent(agentInput(team.id, 'A3'))

    expect(reg.getTeam(team.id)?.mainAgentId).toBe(a1.id)

    reg.deleteAgent(a1.id)
    expect(reg.getAgent(a1.id)).toBeUndefined()
    // Next-oldest surviving agent is a2 (created before a3).
    expect(reg.getTeam(team.id)?.mainAgentId).toBe(a2.id)
    expect(a3.id).not.toBe(a2.id)
  })

  it('deleting the sole agent leaves mainAgentId null', () => {
    const reg = makeRegistry()
    const team = seedTeam(reg)
    const a1 = reg.createAgent(agentInput(team.id, 'Solo'))
    reg.deleteAgent(a1.id)
    expect(reg.getTeam(team.id)?.mainAgentId).toBeNull()
  })

  it('promoteMain throws when the agent belongs to another team', () => {
    const reg = makeRegistry()
    const t1 = reg.createTeam({ name: 'T1', worktreePath: '/tmp/t1' })
    const t2 = reg.createTeam({ name: 'T2', worktreePath: '/tmp/t2' })
    const a1 = reg.createAgent(agentInput(t1.id, 'A1'))
    const a2 = reg.createAgent(agentInput(t2.id, 'A2'))

    // Promoting an agent that exists in t2 should not affect t1's main.
    const updatedT2 = reg.promoteMain(a2.id)
    expect(updatedT2.id).toBe(t2.id)
    expect(updatedT2.mainAgentId).toBe(a2.id)
    expect(reg.getTeam(t1.id)?.mainAgentId).toBe(a1.id)

    // Promoting an unknown agent throws.
    expect(() => reg.promoteMain('00000000-0000-0000-0000-000000000000')).toThrow(
      /agent not found/
    )
  })
})

describe('OrchestraRegistry — edges', () => {
  it('parent == child throws self-edge', () => {
    const reg = makeRegistry()
    const team = seedTeam(reg)
    const a1 = reg.createAgent(agentInput(team.id, 'A1'))
    expect(() =>
      reg.createEdge({
        teamId: team.id,
        parentAgentId: a1.id,
        childAgentId: a1.id
      })
    ).toThrow(/self-edge/)
  })

  it('rejects an edge that would create a cycle', () => {
    const reg = makeRegistry()
    const team = seedTeam(reg)
    const a = reg.createAgent(agentInput(team.id, 'A'))
    const b = reg.createAgent(agentInput(team.id, 'B'))
    const c = reg.createAgent(agentInput(team.id, 'C'))

    reg.createEdge({ teamId: team.id, parentAgentId: a.id, childAgentId: b.id })
    reg.createEdge({ teamId: team.id, parentAgentId: b.id, childAgentId: c.id })

    // c -> a would close the loop a -> b -> c -> a.
    expect(() =>
      reg.createEdge({ teamId: team.id, parentAgentId: c.id, childAgentId: a.id })
    ).toThrow(/cycle/)
  })

  it('rejects edges whose endpoints belong to different teams', () => {
    const reg = makeRegistry()
    const t1 = reg.createTeam({ name: 'T1', worktreePath: '/tmp/t1' })
    const t2 = reg.createTeam({ name: 'T2', worktreePath: '/tmp/t2' })
    const a1 = reg.createAgent(agentInput(t1.id, 'A1'))
    const a2 = reg.createAgent(agentInput(t2.id, 'A2'))

    expect(() =>
      reg.createEdge({
        teamId: t1.id,
        parentAgentId: a1.id,
        childAgentId: a2.id
      })
    ).toThrow(/same team/)
  })

  it('descendants returns the transitive closure from a parent', () => {
    const reg = makeRegistry()
    const team = seedTeam(reg)
    const a = reg.createAgent(agentInput(team.id, 'A'))
    const b = reg.createAgent(agentInput(team.id, 'B'))
    const c = reg.createAgent(agentInput(team.id, 'C'))
    const d = reg.createAgent(agentInput(team.id, 'D'))
    // a -> b -> c,  a -> d
    reg.createEdge({ teamId: team.id, parentAgentId: a.id, childAgentId: b.id })
    reg.createEdge({ teamId: team.id, parentAgentId: b.id, childAgentId: c.id })
    reg.createEdge({ teamId: team.id, parentAgentId: a.id, childAgentId: d.id })

    const reachable = reg.descendants(a.id)
    expect(reachable.has(b.id)).toBe(true)
    expect(reachable.has(c.id)).toBe(true)
    expect(reachable.has(d.id)).toBe(true)
    expect(reachable.has(a.id)).toBe(false)

    const fromB = reg.descendants(b.id)
    expect([...fromB]).toEqual([c.id])
  })
})
