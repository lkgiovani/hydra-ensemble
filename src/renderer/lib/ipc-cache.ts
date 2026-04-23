/**
 * Generic IPC-cache factory — replaces five hand-rolled per-store
 * implementations (claudeCommands, transcripts, projects, toolkit,
 * watchdog) that each reinvented the same `byKey: Record<K, Entry<T>>`
 * pattern with subtly different loading/error shapes.
 *
 * The returned object is meant to be embedded in (or composed with) a
 * zustand slice. It is deliberately framework-agnostic:
 *
 *   // Inside a zustand store
 *   const cmdCache = createIpcCache<string, Command[]>({
 *     fetch: (cwd) => window.api.claude.listCommandsFor(cwd)
 *   })
 *   // Selectors
 *   const entry = cmdCache.get('/path')           // { value, loading, error }
 *   await cmdCache.refresh('/path')
 *   cmdCache.invalidate('/path')
 *
 * The cache does NOT mount the entry onto zustand's `set`; instead it
 * exposes a subscribe()/get() pair so the consumer decides where to
 * store the snapshot. This keeps it trivially testable without React
 * or zustand.
 */

export interface IpcCacheEntry<V> {
  /** Resolved value; undefined until the first successful fetch. */
  value: V | undefined
  loading: boolean
  /** Error message from the most recent failed fetch, if any. */
  error: string | null
  /** Milliseconds since epoch of the last successful fetch — useful
   *  for staleness checks like `Date.now() - updatedAt > 30_000`. */
  updatedAt: number
}

export interface IpcCacheOptions<K, V> {
  /** How to load a fresh value for `key`. Result replaces the cached
   *  entry's value on success, or populates `.error` on failure. */
  fetch: (key: K) => Promise<V>
  /** Stringify the key for internal Map storage. Defaults to
   *  `String(key)` — override when K is an object and you need a
   *  stable identity (e.g. composite key). */
  keyOf?: (key: K) => string
}

export interface IpcCache<K, V> {
  /** Current snapshot for `key`. Returns a zero-entry (undefined value,
   *  not loading, no error) when absent so consumers can destructure
   *  without guarding for undefined. */
  get(key: K): IpcCacheEntry<V>
  /** Trigger a fetch for `key`. Resolves with the cache entry after
   *  the fetch settles (so callers can await + inspect errors). */
  refresh(key: K): Promise<IpcCacheEntry<V>>
  /** Drop the entry for `key`. A subsequent `get` returns a zero-entry
   *  and a subsequent `refresh` re-fetches from scratch. */
  invalidate(key: K): void
  /** Subscribe to cache changes. The callback fires on every mutation
   *  (refresh start, refresh settled, invalidate). Returns an
   *  unsubscribe function. */
  subscribe(fn: (key: K) => void): () => void
}

const ZERO: IpcCacheEntry<never> = {
  value: undefined,
  loading: false,
  error: null,
  updatedAt: 0
}

export function createIpcCache<K, V>(
  opts: IpcCacheOptions<K, V>
): IpcCache<K, V> {
  const keyOf = opts.keyOf ?? ((k: K): string => String(k))
  const store = new Map<string, IpcCacheEntry<V>>()
  const keyByHash = new Map<string, K>()
  const listeners = new Set<(key: K) => void>()

  const emit = (key: K): void => {
    for (const fn of listeners) {
      try {
        fn(key)
      } catch {
        // Subscribers must not throw; swallow so one bad listener
        // doesn't starve the others.
      }
    }
  }

  const get = (key: K): IpcCacheEntry<V> => {
    const entry = store.get(keyOf(key))
    return entry ?? (ZERO as IpcCacheEntry<V>)
  }

  const refresh = async (key: K): Promise<IpcCacheEntry<V>> => {
    const hash = keyOf(key)
    keyByHash.set(hash, key)
    const prev = store.get(hash) ?? (ZERO as IpcCacheEntry<V>)
    store.set(hash, { ...prev, loading: true, error: null })
    emit(key)
    try {
      const value = await opts.fetch(key)
      const next: IpcCacheEntry<V> = {
        value,
        loading: false,
        error: null,
        updatedAt: Date.now()
      }
      store.set(hash, next)
      emit(key)
      return next
    } catch (err) {
      const next: IpcCacheEntry<V> = {
        ...(store.get(hash) ?? (ZERO as IpcCacheEntry<V>)),
        loading: false,
        error: err instanceof Error ? err.message : String(err)
      }
      store.set(hash, next)
      emit(key)
      return next
    }
  }

  const invalidate = (key: K): void => {
    store.delete(keyOf(key))
    emit(key)
  }

  const subscribe = (fn: (key: K) => void): (() => void) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  return { get, refresh, invalidate, subscribe }
}
