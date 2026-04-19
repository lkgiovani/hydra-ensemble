import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { BrowserWindow } from 'electron'
import type { PtyManager } from '../pty/manager'
import type { AnalyzerManager } from '../pty/analyzer-manager'
import type { JsonlManager } from '../claude/jsonl-manager'
import { resolveClaudePath } from '../claude/resolve'
import {
  createIsolatedSession,
  destroyIsolatedSession,
  getSessionEnvOverrides
} from '../claude/config-isolation'
import { getStore, patchStore } from '../store'
import type {
  SessionCreateOptions,
  SessionCreateResult,
  SessionMeta
} from '../../shared/types'

export interface SessionManagerDeps {
  pty: PtyManager
  analyzer?: AnalyzerManager
  jsonl?: JsonlManager
  /** Called for each chunk of PTY data per session — used by the watchdog. */
  onSessionData?: (sessionId: string, data: string) => void
  /** Called when a session is destroyed — used by the watchdog to forget it. */
  onSessionDestroyed?: (sessionId: string) => void
}

export class SessionManager {
  private window: BrowserWindow | null = null
  private sessions = new Map<string, SessionMeta>()
  private unsubscribers = new Map<string, () => void>()

  constructor(private deps: SessionManagerDeps) {
    // Phase 1 keeps it simple: drop stale persisted sessions on init since
    // the underlying PTY processes don't survive app restart.
    for (const s of getStore().sessions) {
      void destroyIsolatedSession(s.id).catch(() => {})
    }
    if (getStore().sessions.length > 0) {
      patchStore({ sessions: [] })
    }
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win
  }

  list(): SessionMeta[] {
    return [...this.sessions.values()]
  }

  async create(opts: SessionCreateOptions): Promise<SessionCreateResult> {
    const id = randomUUID()
    const ptyId = id
    const cwd = opts.cwd ?? opts.worktreePath ?? homedir()
    const name = opts.name?.trim() || `session-${this.sessions.size + 1}`

    let isolated
    try {
      isolated = await createIsolatedSession(id, {
        name,
        cwd,
        worktreePath: opts.worktreePath,
        branch: opts.branch
      })
    } catch (err) {
      return { ok: false, error: `failed to create isolated config: ${(err as Error).message}` }
    }

    const env = getSessionEnvOverrides(isolated)

    const result = this.deps.pty.spawn({
      sessionId: ptyId,
      cwd,
      cols: opts.cols,
      rows: opts.rows,
      env
    })

    if (!result.ok) {
      await destroyIsolatedSession(id).catch(() => {})
      return { ok: false, error: result.error }
    }

    // Wire PTY data into analyzer (state detection) and watchdog feed.
    const analyzerInstance = this.deps.analyzer?.forSession(ptyId)
    const offData = this.deps.pty.onData(ptyId, (data) => {
      analyzerInstance?.feed(data)
      this.deps.onSessionData?.(ptyId, data)
    })
    this.unsubscribers.set(ptyId, offData)

    // Start JSONL watcher tied to this session's isolated config dir.
    this.deps.jsonl?.start({
      id: ptyId,
      claudeConfigDir: isolated.configDir,
      cwd
    })

    if (!opts.shellOnly) {
      const claudePath = resolveClaudePath()
      const launch = claudePath
        ? `clear && exec "${claudePath}"\r`
        : `clear && echo "[hydra-ensemble] claude binary not found in PATH"\r`
      setTimeout(() => {
        this.deps.pty.write(ptyId, launch)
      }, 350)
    }

    const meta: SessionMeta = {
      id,
      name,
      cwd,
      worktreePath: opts.worktreePath,
      branch: opts.branch,
      claudeConfigDir: isolated.configDir,
      createdAt: new Date().toISOString(),
      ptyId,
      state: 'idle'
    }

    this.sessions.set(id, meta)
    this.persist()
    this.notifyChange()

    return { ok: true, session: meta }
  }

  async destroy(id: string): Promise<void> {
    const meta = this.sessions.get(id)
    if (!meta) return
    this.unsubscribers.get(meta.ptyId)?.()
    this.unsubscribers.delete(meta.ptyId)
    this.deps.jsonl?.stop(meta.ptyId)
    this.deps.analyzer?.dispose(meta.ptyId)
    this.deps.onSessionDestroyed?.(meta.ptyId)
    this.deps.pty.kill(meta.ptyId)
    await destroyIsolatedSession(id).catch(() => {})
    this.sessions.delete(id)
    this.persist()
    this.notifyChange()
  }

  async destroyAll(): Promise<void> {
    const ids = [...this.sessions.keys()]
    for (const id of ids) {
      await this.destroy(id)
    }
  }

  rename(id: string, name: string): void {
    const meta = this.sessions.get(id)
    if (!meta) return
    const trimmed = name.trim()
    if (!trimmed) return
    meta.name = trimmed
    this.persist()
    this.notifyChange()
  }

  /** Patch a session's live fields (state, cost, tokens, model). */
  patchLive(
    sessionId: string,
    patch: Partial<Pick<SessionMeta, 'state' | 'cost' | 'tokensIn' | 'tokensOut' | 'model' | 'latestAssistantText'>>
  ): void {
    const meta = this.sessions.get(sessionId)
    if (!meta) return
    Object.assign(meta, patch)
    this.notifyChange()
  }

  private persist(): void {
    patchStore({ sessions: this.list() })
  }

  private notifyChange(): void {
    this.window?.webContents.send('session:changed', this.list())
  }
}
