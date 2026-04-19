import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

let userData: string

vi.mock('electron', () => ({
  app: {
    getPath: () => userData
  }
}))

const tmpDirs: string[] = []

beforeAll(async () => {
  userData = await mkdtemp(path.join(os.tmpdir(), `hydra-ensemble-watchdog-${randomUUID()}-`))
  tmpDirs.push(userData)
})

afterAll(async () => {
  for (const d of tmpDirs) {
    await rm(d, { recursive: true, force: true })
  }
})

beforeEach(async () => {
  const { initStore, patchStore } = await import('../../store')
  initStore()
  patchStore({ watchdogs: [] })
})

describe('WatchdogService', () => {
  it('fires once on match, then again only after cooldown', async () => {
    const { WatchdogService } = await import('../manager')
    vi.useFakeTimers()
    try {
      const svc = new WatchdogService()
      svc.save([
        {
          id: 'rule-attention',
          name: 'attention',
          enabled: true,
          triggerPattern: 'NEEDS_HELP',
          action: 'notify',
          cooldownMs: 1_000
        }
      ])

      const sessionId = 'session-A'
      const first = svc.feed(sessionId, 'hello world NEEDS_HELP now\n')
      expect(first).toHaveLength(1)
      expect(first[0]?.ruleId).toBe('rule-attention')
      expect(first[0]?.matched).toBe('NEEDS_HELP')

      // Same data within the cooldown window: no fire.
      const second = svc.feed(sessionId, 'still NEEDS_HELP\n')
      expect(second).toHaveLength(0)

      // After the cooldown elapses, the rule may fire again.
      vi.setSystemTime(Date.now() + 1_500)
      const third = svc.feed(sessionId, 'NEEDS_HELP again\n')
      expect(third).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('disables a rule whose regex is invalid and does not throw on feed()', async () => {
    const { WatchdogService } = await import('../manager')
    const { getStore } = await import('../../store')
    const svc = new WatchdogService()
    svc.save([
      {
        id: 'broken',
        name: 'broken',
        enabled: true,
        triggerPattern: '([unterminated',
        action: 'notify',
        cooldownMs: 0
      },
      {
        id: 'good',
        name: 'good',
        enabled: true,
        triggerPattern: 'OK',
        action: 'notify',
        cooldownMs: 0
      }
    ])

    // Persisted state should reflect the auto-disable of the broken rule.
    const persisted = getStore().watchdogs
    const broken = persisted.find((r) => r.id === 'broken')
    expect(broken?.enabled).toBe(false)

    // feed() must not throw and must still fire the good rule.
    const fired = svc.feed('s1', 'OK now\n')
    expect(fired.map((f) => f.ruleId)).toEqual(['good'])
  })

  it('invokes the onAction callback for sendInput and kill actions', async () => {
    const { WatchdogService } = await import('../manager')
    const calls: Array<{ kind: string; sessionId: string; data?: string }> = []
    const svc = new WatchdogService({
      onAction: (a) => calls.push({ kind: a.kind, sessionId: a.sessionId, data: a.data })
    })
    svc.save([
      {
        id: 'feed-y',
        name: 'feed y',
        enabled: true,
        triggerPattern: 'Continue\\?',
        action: 'sendInput',
        payload: 'y\r',
        cooldownMs: 0
      },
      {
        id: 'kill-on-panic',
        name: 'panic killer',
        enabled: true,
        triggerPattern: 'PANIC',
        action: 'kill',
        cooldownMs: 0
      }
    ])

    svc.feed('s1', 'Do you want to Continue?')
    svc.feed('s2', 'fatal: PANIC encountered')

    expect(calls).toEqual([
      { kind: 'sendInput', sessionId: 's1', data: 'y\r' },
      { kind: 'kill', sessionId: 's2', data: undefined }
    ])
  })

  it('caps the per-session window so old data ages out', async () => {
    const { WatchdogService } = await import('../manager')
    const svc = new WatchdogService()
    svc.save([
      {
        id: 'old',
        name: 'old marker',
        enabled: true,
        triggerPattern: 'BEGIN',
        action: 'notify',
        cooldownMs: 0
      }
    ])

    // First chunk contains the marker, but we then push >4 KB of filler
    // which should evict it from the rolling window.
    svc.feed('s1', 'BEGIN\n')
    // Drop cooldown bookkeeping by wiping the session.
    svc.forgetSession('s1')

    const filler = 'x'.repeat(8 * 1024)
    const fired = svc.feed('s1', filler)
    expect(fired).toHaveLength(0)
  })
})
