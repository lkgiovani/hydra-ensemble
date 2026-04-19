import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// `../store` (transitively imported by ToolkitService) pulls in `electron`,
// which has no proper export shape outside the runtime. Stub a minimal `app`
// pointing at a tmp dir so initStore() can write `store.json`.
let userData: string

vi.mock('electron', () => ({
  app: {
    getPath: () => userData
  }
}))

const tmpDirs: string[] = []

beforeAll(async () => {
  userData = await mkdtemp(path.join(os.tmpdir(), `hydra-ensemble-toolkit-${randomUUID()}-`))
  tmpDirs.push(userData)
})

afterAll(async () => {
  for (const d of tmpDirs) {
    await rm(d, { recursive: true, force: true })
  }
})

describe('ToolkitService', () => {
  it('runs `echo hello` and captures stdout / exitCode / durationMs', async () => {
    const { initStore } = await import('../../store')
    const { ToolkitService } = await import('../manager')
    initStore()
    const svc = new ToolkitService()

    const command = process.platform === 'win32' ? 'cmd /c echo hello' : 'echo hello'
    svc.save([{ id: 'echo', label: 'echo', command }])

    const cwd = process.cwd()
    const result = await svc.run('echo', cwd)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/hello/)
    expect(result.durationMs).toBeGreaterThan(0)
  }, 35_000)

  it('returns a non-zero exitCode when the command does not exist', async () => {
    const { ToolkitService } = await import('../manager')
    const svc = new ToolkitService()
    svc.save([
      {
        id: 'missing',
        label: 'missing',
        command: 'this-binary-definitely-does-not-exist-xyz123'
      }
    ])
    const result = await svc.run('missing', process.cwd())
    expect(result.exitCode).not.toBe(0)
    expect(result.durationMs).toBeGreaterThan(0)
  }, 35_000)

  it('returns a synthetic error when id is unknown', async () => {
    const { ToolkitService } = await import('../manager')
    const svc = new ToolkitService()
    svc.save([{ id: 'echo', label: 'echo', command: 'echo hi' }])
    const result = await svc.run('does-not-exist', process.cwd())
    expect(result.exitCode).toBe(-1)
    expect(result.stderr).toMatch(/not found/)
  })

  it('seeds defaults when the store has no toolkit configured', async () => {
    const { patchStore, getStore } = await import('../../store')
    const { ToolkitService } = await import('../manager')
    patchStore({ toolkit: [] })
    expect(getStore().toolkit.length).toBe(0)

    const svc = new ToolkitService()
    const items = svc.list()
    // Default seed covers the verify / deps / run / git / shell groups —
    // see DEFAULT_TOOLKIT in manager.ts.
    expect(items.length).toBeGreaterThanOrEqual(8)
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(['test', 'build', 'lint']))
    // Defaults are persisted so the next list() is stable.
    expect(getStore().toolkit.length).toBe(items.length)
  })
})
