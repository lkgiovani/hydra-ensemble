import { describe, it, expect, vi } from 'vitest'
import { createIpcCache } from '../ipc-cache'

describe('ipc-cache', () => {
  it('returns a zero-entry before first refresh', () => {
    const cache = createIpcCache<string, number>({ fetch: async () => 1 })
    const entry = cache.get('missing')
    expect(entry.value).toBeUndefined()
    expect(entry.loading).toBe(false)
    expect(entry.error).toBeNull()
    expect(entry.updatedAt).toBe(0)
  })

  it('sets loading=true synchronously on refresh then loads value', async () => {
    const fetch = vi.fn().mockResolvedValue(42)
    const cache = createIpcCache<string, number>({ fetch })
    const p = cache.refresh('k')
    expect(cache.get('k').loading).toBe(true)
    const result = await p
    expect(result.value).toBe(42)
    expect(result.loading).toBe(false)
    expect(result.error).toBeNull()
    expect(result.updatedAt).toBeGreaterThan(0)
  })

  it('captures error messages on fetch rejection', async () => {
    const cache = createIpcCache<string, number>({
      fetch: async () => {
        throw new Error('boom')
      }
    })
    const entry = await cache.refresh('k')
    expect(entry.loading).toBe(false)
    expect(entry.error).toBe('boom')
    expect(entry.value).toBeUndefined()
  })

  it('keeps the previous value when a subsequent refresh fails', async () => {
    let shouldFail = false
    const cache = createIpcCache<string, number>({
      fetch: async () => {
        if (shouldFail) throw new Error('rate-limit')
        return 7
      }
    })
    const ok = await cache.refresh('k')
    expect(ok.value).toBe(7)
    shouldFail = true
    const fail = await cache.refresh('k')
    expect(fail.value).toBe(7) // stale data preserved
    expect(fail.error).toBe('rate-limit')
  })

  it('invalidate drops the entry back to zero', async () => {
    const cache = createIpcCache<string, number>({ fetch: async () => 9 })
    await cache.refresh('k')
    expect(cache.get('k').value).toBe(9)
    cache.invalidate('k')
    expect(cache.get('k').value).toBeUndefined()
    expect(cache.get('k').updatedAt).toBe(0)
  })

  it('notifies subscribers on refresh start, success, and invalidate', async () => {
    const cache = createIpcCache<string, number>({ fetch: async () => 1 })
    const calls: string[] = []
    const unsub = cache.subscribe((key) => calls.push(key))
    await cache.refresh('a')
    cache.invalidate('a')
    unsub()
    cache.invalidate('a')
    // loading-start, loading-end, invalidate — unsub blocks the final one.
    expect(calls).toEqual(['a', 'a', 'a'])
  })

  it('honours custom keyOf for composite keys', async () => {
    const cache = createIpcCache<{ cwd: string; n: number }, string>({
      fetch: async (k) => `${k.cwd}:${k.n}`,
      keyOf: (k) => `${k.cwd}#${k.n}`
    })
    await cache.refresh({ cwd: '/a', n: 1 })
    await cache.refresh({ cwd: '/a', n: 2 })
    expect(cache.get({ cwd: '/a', n: 1 }).value).toBe('/a:1')
    expect(cache.get({ cwd: '/a', n: 2 }).value).toBe('/a:2')
  })

  it('does not let a throwing subscriber starve the others', async () => {
    const cache = createIpcCache<string, number>({ fetch: async () => 1 })
    const a = vi.fn()
    const b = vi.fn(() => {
      throw new Error('nope')
    })
    const c = vi.fn()
    cache.subscribe(a)
    cache.subscribe(b)
    cache.subscribe(c)
    await cache.refresh('k')
    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
    expect(c).toHaveBeenCalled()
  })
})
