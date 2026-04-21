import { randomUUID } from 'node:crypto'
import { mkdir, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MessageLog, UUID } from '../../shared/orchestra'

/**
 * In-memory append-only log for agent/task messages, with an overflow policy
 * that flushes oldest entries to NDJSON on disk once the cap is breached.
 *
 * See PLAN.md §3.1 (messageLog cap) and §3.2 (on-disk team folder layout).
 */

export interface MessageLogStoreOptions {
  /** Map a teamId to its on-disk slug (registry.getTeam(id)?.slug). Throws for unknown teams. */
  teamSlugOf: (teamId: UUID) => string
  /** Orchestra root (e.g. `~/.hydra-ensemble/orchestra`). Team dirs live under `teams/<slug>/`. */
  rootDir: string
  /** Maximum entries held in memory before a flush is triggered. Default 2000. */
  cap?: number
  /** Target in-memory size after a flush. Default 1500. */
  lowWater?: number
}

type Listener = (entry: MessageLog) => void

const DEFAULT_CAP = 2000
const DEFAULT_LOW_WATER = 1500

export class MessageLogStore {
  private readonly teamSlugOf: (teamId: UUID) => string
  private readonly rootDir: string
  private readonly cap: number
  private readonly lowWater: number

  private entries: MessageLog[] = []
  private listeners = new Set<Listener>()
  /** Chain of pending disk writes — append() schedules on this tail so we never block. */
  private pending: Promise<void> = Promise.resolve()
  private closed = false

  constructor(opts: MessageLogStoreOptions) {
    if (!opts.rootDir) throw new Error('rootDir required')
    this.teamSlugOf = opts.teamSlugOf
    this.rootDir = opts.rootDir
    this.cap = opts.cap ?? DEFAULT_CAP
    this.lowWater = opts.lowWater ?? DEFAULT_LOW_WATER
    if (this.lowWater >= this.cap) {
      throw new Error('lowWater must be < cap')
    }
  }

  append(entry: Omit<MessageLog, 'id' | 'at'>): MessageLog {
    const full: MessageLog = {
      ...entry,
      id: randomUUID(),
      at: new Date().toISOString()
    }
    this.entries.push(full)

    for (const fn of this.listeners) {
      try {
        fn(full)
      } catch {
        // Subscriber failures never propagate — logging is best-effort.
      }
    }

    if (this.entries.length >= this.cap) {
      this.scheduleFlush()
    }
    return full
  }

  listForTask(taskId: UUID, limit?: number): MessageLog[] {
    return this.slice(this.entries.filter((m) => m.taskId === taskId), limit)
  }

  listForAgent(agentId: UUID, limit?: number): MessageLog[] {
    return this.slice(
      this.entries.filter(
        (m) => m.fromAgentId === agentId || m.toAgentId === agentId
      ),
      limit
    )
  }

  listForTeam(teamId: UUID, limit?: number): MessageLog[] {
    return this.slice(this.entries.filter((m) => m.teamId === teamId), limit)
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Await any scheduled disk writes. Safe to call repeatedly. */
  async flush(): Promise<void> {
    // Capture the current pending chain so callers only wait for already-scheduled work.
    await this.pending
  }

  async close(): Promise<void> {
    this.closed = true
    await this.flush()
    this.listeners.clear()
  }

  // ------------------------------------------------------------------ internals

  private slice(list: MessageLog[], limit?: number): MessageLog[] {
    if (limit === undefined || limit <= 0 || limit >= list.length) return list
    return list.slice(-limit)
  }

  /** Enqueue an async flush on the microtask queue without blocking append(). */
  private scheduleFlush(): void {
    if (this.closed) return
    const evictCount = Math.max(0, this.entries.length - this.lowWater)
    if (evictCount === 0) return
    // Splice synchronously so further appends can't re-schedule the same entries.
    const evicted = this.entries.splice(0, evictCount)
    this.pending = this.pending.then(() => this.flushEvicted(evicted)).catch(() => {
      // Swallow — write failures should not poison the chain for later flushes.
    })
  }

  private async flushEvicted(evicted: MessageLog[]): Promise<void> {
    // Group by teamId so each team's file gets one appendFile call.
    const byTeam = new Map<UUID, MessageLog[]>()
    for (const m of evicted) {
      const bucket = byTeam.get(m.teamId)
      if (bucket) bucket.push(m)
      else byTeam.set(m.teamId, [m])
    }

    for (const [teamId, bucket] of byTeam) {
      let slug: string
      try {
        slug = this.teamSlugOf(teamId)
      } catch {
        // Orphaned team (deleted) — keep entries in memory; they'll re-evict later.
        this.entries.unshift(...bucket)
        continue
      }
      const dir = join(this.rootDir, 'teams', slug)
      const file = join(dir, 'messages.ndjson')
      try {
        await mkdir(dir, { recursive: true })
        const payload = bucket.map((m) => JSON.stringify(m)).join('\n') + '\n'
        await appendFile(file, payload, 'utf8')
      } catch (err) {
        // Disk failure — push entries back so nothing is lost.
        this.entries.unshift(...bucket)
        throw err
      }
    }
  }
}
