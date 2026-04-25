/**
 * FileWatcher — multi-subscriber chokidar wrapper for the in-app editor.
 *
 * The renderer needs to know when files it has open are mutated on disk
 * (saved by another tool, swapped out by `git checkout`, deleted by an
 * agent run) so it can auto-reload clean buffers and surface a conflict
 * banner on dirty ones. Chokidar handles the FS events; this class adds:
 *
 *   - reference-counted subscriptions per absolute path (one watcher per
 *     path, no matter how many subscribers)
 *   - throttle per-path so a flurry of rename/swap-style writes doesn't
 *     spam the renderer
 *   - sha1 hashing of the new content so the renderer can short-circuit
 *     loops where its own save triggers a 'change' event
 *
 * The class extends EventEmitter; consumers listen for 'fileChanged'
 * and 'fileDeleted'.
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import chokidar, { type FSWatcher } from 'chokidar'

export interface FileChangedPayload {
  path: string
  mtime: number
  size: number
  hash: string
}

export interface FileDeletedPayload {
  path: string
}

interface Entry {
  watcher: FSWatcher
  /** Number of active subscribers for this path. When it drops to zero
   *  the watcher is closed and the entry is removed. */
  refCount: number
}

const THROTTLE_MS = 50

type LoggerFn = (msg: string, meta?: Record<string, unknown>) => void

const noopLogger: LoggerFn = () => {}

export class FileWatcher extends EventEmitter {
  private readonly entries = new Map<string, Entry>()
  private readonly lastEmit = new Map<string, number>()
  private readonly logger: LoggerFn

  constructor(logger?: LoggerFn) {
    super()
    this.logger = logger ?? noopLogger
  }

  /**
   * Subscribe to a file. Multiple subscribes for the same path share a
   * single chokidar watcher; each call increments the ref count. The
   * caller MUST balance every `subscribe` with an `unsubscribe`.
   */
  subscribe(path: string): void {
    const existing = this.entries.get(path)
    if (existing) {
      existing.refCount += 1
      return
    }
    const watcher = chokidar.watch(path, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
    })
    watcher.on('change', () => {
      void this.handleChange(path)
    })
    watcher.on('unlink', () => {
      this.handleUnlink(path)
    })
    watcher.on('error', (err: unknown) => {
      this.logger('[file-watcher] watcher error', {
        path,
        error: (err as Error)?.message ?? String(err)
      })
    })
    this.entries.set(path, { watcher, refCount: 1 })
  }

  /**
   * Decrement the ref count for `path`. When it drops to zero the
   * watcher is closed and the entry forgotten.
   */
  unsubscribe(path: string): void {
    const entry = this.entries.get(path)
    if (!entry) return
    entry.refCount -= 1
    if (entry.refCount > 0) return
    this.entries.delete(path)
    this.lastEmit.delete(path)
    void entry.watcher.close().catch((err: unknown) => {
      this.logger('[file-watcher] close failed', {
        path,
        error: (err as Error)?.message ?? String(err)
      })
    })
  }

  /** Tear down every watcher. Used at app shutdown. */
  dispose(): void {
    for (const [path, entry] of this.entries) {
      void entry.watcher.close().catch((err: unknown) => {
        this.logger('[file-watcher] close failed', {
          path,
          error: (err as Error)?.message ?? String(err)
        })
      })
    }
    this.entries.clear()
    this.lastEmit.clear()
    this.removeAllListeners()
  }

  private shouldThrottle(path: string): boolean {
    const now = Date.now()
    const last = this.lastEmit.get(path) ?? 0
    if (now - last < THROTTLE_MS) return true
    this.lastEmit.set(path, now)
    return false
  }

  private async handleChange(path: string): Promise<void> {
    if (this.shouldThrottle(path)) return
    try {
      const stats = await stat(path)
      const hash = await hashFile(path)
      const payload: FileChangedPayload = {
        path,
        mtime: Number(stats.mtimeMs),
        size: stats.size,
        hash
      }
      this.emit('fileChanged', payload)
    } catch (err) {
      this.logger('[file-watcher] change handler failed', {
        path,
        error: (err as Error)?.message ?? String(err)
      })
    }
  }

  private handleUnlink(path: string): void {
    if (this.shouldThrottle(path)) return
    const payload: FileDeletedPayload = { path }
    this.emit('fileDeleted', payload)
  }
}

/**
 * Stream-hash a file with sha1. Streaming avoids loading megabyte-sized
 * files into memory just to detect a "did the disk content actually
 * change?" round-trip. Returns the hex digest.
 */
export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** Synchronously compute sha1 of an in-memory string (used by the IPC
 *  layer to return the post-write hash to the renderer). */
export function hashString(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}
