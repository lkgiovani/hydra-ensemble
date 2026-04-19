import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { BrowserWindow } from 'electron'
import type { PtyManager } from '../pty/manager'
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

export class SessionManager {
  private window: BrowserWindow | null = null
  private sessions = new Map<string, SessionMeta>()

  constructor(private pty: PtyManager) {
    // Load persisted sessions metadata. Note: PTY processes do NOT survive
    // app restarts — these are surfaced as "stale" entries the user can
    // re-spawn or destroy. Phase 1 keeps it simple: drop stale on init.
    for (const s of getStore().sessions) {
      // We won't actually rehydrate the PTY in Phase 1.
      // Cleanup: remove the orphaned config dir so disk doesn't bloat.
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

    const result = this.pty.spawn({
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

    if (!opts.shellOnly) {
      const claudePath = resolveClaudePath()
      const launch = claudePath
        ? `clear && exec "${claudePath}"\r`
        : `clear && echo "[hydra-ensemble] claude binary not found in PATH"\r`
      // Give the shell a moment to print its prompt before we replace it.
      setTimeout(() => {
        this.pty.write(ptyId, launch)
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
    this.pty.kill(meta.ptyId)
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

  private persist(): void {
    patchStore({ sessions: this.list() })
  }

  private notifyChange(): void {
    this.window?.webContents.send('session:changed', this.list())
  }
}
