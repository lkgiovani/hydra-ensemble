import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import yaml from 'js-yaml'

import {
  agentDir,
  createAgentFolder,
  createTeamFolder,
  deleteAgentFolder,
  deleteTeamFolder,
  orchestraRoot,
  readSkills,
  readSoul,
  readTriggers,
  setOrchestraRootForTests,
  teamDir,
  teamsRoot,
  watchTeams,
  writeSoul,
  writeTriggers
} from '../disk'
import type { Trigger } from '../../../shared/orchestra'

/**
 * Each test gets its own ephemeral directory under `os.tmpdir()` with a
 * random UUID, so parallel runs and aborted runs don't clash.
 */
describe('orchestra/disk', () => {
  let sandbox: string

  beforeEach(async () => {
    sandbox = path.join(os.tmpdir(), `hydra-orchestra-${randomUUID()}`)
    await mkdir(sandbox, { recursive: true })
    setOrchestraRootForTests(sandbox)
  })

  afterEach(async () => {
    setOrchestraRootForTests(null)
    await rm(sandbox, { recursive: true, force: true })
  })

  it('createTeamFolder creates CLAUDE.md, team.meta.json, and agents dir', async () => {
    await createTeamFolder('alpha')

    const claudeMd = await readFile(path.join(teamDir('alpha'), 'CLAUDE.md'), 'utf8')
    expect(claudeMd).toContain('# alpha team')
    expect(claudeMd).toContain('Shared instructions for every agent')

    const metaRaw = await readFile(
      path.join(teamDir('alpha'), 'team.meta.json'),
      'utf8'
    )
    const meta = JSON.parse(metaRaw) as { createdAt: string; updatedAt: string }
    expect(typeof meta.createdAt).toBe('string')
    expect(typeof meta.updatedAt).toBe('string')
    expect(Number.isFinite(Date.parse(meta.createdAt))).toBe(true)

    const agentsStat = await stat(path.join(teamDir('alpha'), 'agents'))
    expect(agentsStat.isDirectory()).toBe(true)

    // The chosen root actually wires through.
    expect(orchestraRoot()).toBe(sandbox)
    expect(teamsRoot()).toBe(path.join(sandbox, 'teams'))
  })

  it('createAgentFolder with blank preset: empty skills, one manual trigger', async () => {
    await createTeamFolder('alpha')
    await createAgentFolder('alpha', 'solo', 'blank')

    const soul = await readSoul('alpha', 'solo')
    expect(soul).toContain('# Role')

    const skills = await readSkills('alpha', 'solo')
    expect(skills).toEqual([])

    const triggers = await readTriggers('alpha', 'solo')
    expect(triggers).toHaveLength(1)
    const first = triggers[0]
    expect(first).toBeDefined()
    if (!first) return
    expect(first.kind).toBe('manual')
    expect(first.enabled).toBe(true)
    expect(typeof first.id).toBe('string')
    expect(first.id.length).toBeGreaterThan(0)
  })

  it('createAgentFolder with reviewer preset: non-empty skills + triggers', async () => {
    await createTeamFolder('alpha')
    await createAgentFolder('alpha', 'rev', 'reviewer')

    const skills = await readSkills('alpha', 'rev')
    expect(skills.length).toBeGreaterThanOrEqual(2)
    expect(skills.every((s) => typeof s.name === 'string' && s.weight > 0)).toBe(true)

    const triggers = await readTriggers('alpha', 'rev')
    expect(triggers.length).toBeGreaterThanOrEqual(2)
    // Spec-pinned concrete triggers from the prompt.
    const tagReview = triggers.find((t) => t.kind === 'tag' && t.pattern === 'review')
    expect(tagReview?.priority).toBe(8)
    const pathGo = triggers.find((t) => t.kind === 'path' && t.pattern === '**/*.go')
    expect(pathGo?.priority).toBe(6)
  })

  it('writeSoul then readSoul round-trips exactly', async () => {
    await createTeamFolder('alpha')
    await createAgentFolder('alpha', 'solo', 'blank')
    const text = '# Role\n\nCustom soul written by the test.\n\n- bullet 1\n'
    await writeSoul('alpha', 'solo', text)
    const back = await readSoul('alpha', 'solo')
    expect(back).toBe(text)
  })

  it('readTriggers injects missing ids and persists them back', async () => {
    await createTeamFolder('alpha')
    await createAgentFolder('alpha', 'solo', 'blank')

    // Overwrite triggers.yaml with entries that are missing ids entirely.
    const withoutIds = [
      { kind: 'tag', pattern: 'urgent', priority: 9, enabled: true },
      { kind: 'manual', pattern: '', priority: 0, enabled: true }
    ]
    const file = path.join(agentDir('alpha', 'solo'), 'triggers.yaml')
    await writeFile(file, yaml.dump(withoutIds), 'utf8')

    const first = await readTriggers('alpha', 'solo')
    expect(first).toHaveLength(2)
    for (const t of first) {
      expect(typeof t.id).toBe('string')
      expect(t.id.length).toBeGreaterThan(0)
    }

    // The file was rewritten with ids present — second read matches first.
    const rawAfter = await readFile(file, 'utf8')
    const parsedAfter = yaml.load(rawAfter) as Trigger[]
    expect(parsedAfter).toHaveLength(2)
    for (const t of parsedAfter) {
      expect(typeof t.id).toBe('string')
      expect(t.id.length).toBeGreaterThan(0)
    }

    const second = await readTriggers('alpha', 'solo')
    expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id))
  })

  it('deleteTeamFolder refuses paths outside the orchestra root', async () => {
    await createTeamFolder('alpha')

    // A slug like `../../etc` would escape the root; the guard must fire.
    await expect(deleteTeamFolder('../../..')).rejects.toThrow(/orchestra root/)

    // Legit deletion still works.
    await deleteTeamFolder('alpha')
    await expect(stat(teamDir('alpha'))).rejects.toThrow()
  })

  it('deleteAgentFolder removes the agent but leaves the team intact', async () => {
    await createTeamFolder('alpha')
    await createAgentFolder('alpha', 'solo', 'blank')
    await createAgentFolder('alpha', 'other', 'blank')

    await deleteAgentFolder('alpha', 'solo')

    await expect(stat(agentDir('alpha', 'solo'))).rejects.toThrow()
    const teamStat = await stat(teamDir('alpha'))
    expect(teamStat.isDirectory()).toBe(true)
    const otherStat = await stat(agentDir('alpha', 'other'))
    expect(otherStat.isDirectory()).toBe(true)
  })

  it('watchTeams fires on external writes but not on our own write*', async () => {
    await createTeamFolder('alpha')
    await createAgentFolder('alpha', 'solo', 'blank')

    const events: Array<{ kind: string; teamSlug: string; agentSlug?: string }> = []
    const dispose = watchTeams((ev) => {
      events.push(ev)
    })
    // chokidar needs a tick to bring the watcher online; we also use the
    // awaitWriteFinish window configured inside disk.ts (50ms).
    await new Promise((r) => setTimeout(r, 250))

    // Our own write should be suppressed.
    await writeTriggers('alpha', 'solo', [
      { id: randomUUID(), kind: 'tag', pattern: 'quiet', priority: 5, enabled: true }
    ])
    await new Promise((r) => setTimeout(r, 200))
    const selfEvents = events.filter(
      (e) => e.kind === 'triggers' && e.agentSlug === 'solo'
    )
    expect(selfEvents).toHaveLength(0)

    // An external write (outside our write* path) should bubble through.
    // We wait past the 250ms self-write suppression window before writing
    // so the path isn't still in the "recently written" set.
    await new Promise((r) => setTimeout(r, 300))
    const soulFile = path.join(agentDir('alpha', 'solo'), 'soul.md')
    await writeFile(soulFile, '# Edited externally\n', 'utf8')
    await new Promise((r) => setTimeout(r, 400))

    const externalSoul = events.find(
      (e) => e.kind === 'soul' && e.agentSlug === 'solo' && e.teamSlug === 'alpha'
    )
    expect(externalSoul).toBeDefined()

    dispose()
  })
})
