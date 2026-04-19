import { mkdir, writeFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SESSIONS_ROOT = join(homedir(), '.hydra-ensemble', 'sessions')
const HOST_CLAUDE = join(homedir(), '.claude')

export interface IsolatedSession {
  sessionId: string
  rootDir: string // ~/.hydra-ensemble/sessions/<id>
  /**
   * Pointer to the Claude config directory this session reads from.
   *
   * We used to create a per-session shadow (~/.hydra-ensemble/sessions/<id>/claude)
   * with symlinks back to the host. That broke authentication across sessions:
   * Claude writes `.credentials.json` atomically, which clobbered the symlink
   * with a regular file, so every new session started logged-out.
   *
   * New behaviour: every session reads directly from the host `~/.claude`.
   * Natural segregation comes from the worktree CWD — Claude keys its
   * `projects/<encoded-cwd>/*.jsonl` by the spawn CWD, so parallel sessions
   * on different worktrees still get distinct history files.
   */
  configDir: string
  metaPath: string
}

export interface SessionMetaJson {
  sessionId: string
  name: string
  cwd: string
  worktreePath?: string
  branch?: string
  createdAt: string
}

export async function createIsolatedSession(
  sessionId: string,
  meta: Omit<SessionMetaJson, 'sessionId' | 'createdAt'>
): Promise<IsolatedSession> {
  const rootDir = join(SESSIONS_ROOT, sessionId)
  await mkdir(rootDir, { recursive: true })

  const metaPath = join(rootDir, 'meta.json')
  const metaJson: SessionMetaJson = {
    sessionId,
    createdAt: new Date().toISOString(),
    ...meta
  }
  await writeFile(metaPath, JSON.stringify(metaJson, null, 2))

  return {
    sessionId,
    rootDir,
    configDir: HOST_CLAUDE,
    metaPath
  }
}

export async function destroyIsolatedSession(sessionId: string): Promise<void> {
  const rootDir = join(SESSIONS_ROOT, sessionId)
  await rm(rootDir, { recursive: true, force: true })
}

/**
 * Env vars handed to the PTY. We used to set CLAUDE_CONFIG_DIR here to
 * point at the shadow dir — that's gone because it broke login sharing.
 * Only the session-id marker is exposed now.
 */
export function getSessionEnvOverrides(isolated: IsolatedSession): Record<string, string> {
  return {
    HYDRA_ENSEMBLE_SESSION_ID: isolated.sessionId
  }
}

export function getSessionsRoot(): string {
  return SESSIONS_ROOT
}

export function getHostClaudeDir(): string {
  return HOST_CLAUDE
}
