import { existsSync } from 'node:fs'
import { mkdir, writeFile, rm, symlink, copyFile, cp, lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SESSIONS_ROOT = join(homedir(), '.hydra-ensemble', 'sessions')
const HOST_CLAUDE = join(homedir(), '.claude')

/**
 * Files we link from ~/.claude into the per-session shadow.
 * These are non-mutated by claude during a session.
 */
const SHARED_FILES = ['.credentials.json', 'settings.json', 'CLAUDE.md']

/**
 * Directories linked from ~/.claude. Symlinked when possible (Unix),
 * recursively copied as a fallback (Windows without admin).
 */
const SHARED_DIRS = ['commands', 'agents', 'plugins', 'skills']

export interface IsolatedSession {
  sessionId: string
  rootDir: string // ~/.hydra-ensemble/sessions/<id>
  configDir: string // ~/.hydra-ensemble/sessions/<id>/claude
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
  const configDir = join(rootDir, 'claude')
  await mkdir(configDir, { recursive: true })

  for (const file of SHARED_FILES) {
    const source = join(HOST_CLAUDE, file)
    if (!existsSync(source)) continue
    await linkOrCopy(source, join(configDir, file), false)
  }

  for (const dir of SHARED_DIRS) {
    const source = join(HOST_CLAUDE, dir)
    if (!existsSync(source)) continue
    await linkOrCopy(source, join(configDir, dir), true)
  }

  const metaPath = join(rootDir, 'meta.json')
  const metaJson: SessionMetaJson = {
    sessionId,
    createdAt: new Date().toISOString(),
    ...meta
  }
  await writeFile(metaPath, JSON.stringify(metaJson, null, 2))

  return { sessionId, rootDir, configDir, metaPath }
}

export async function destroyIsolatedSession(sessionId: string): Promise<void> {
  const rootDir = join(SESSIONS_ROOT, sessionId)
  await rm(rootDir, { recursive: true, force: true })
}

export function getSessionEnvOverrides(isolated: IsolatedSession): Record<string, string> {
  return {
    CLAUDE_CONFIG_DIR: isolated.configDir,
    HYDRA_ENSEMBLE_SESSION_ID: isolated.sessionId
  }
}

export function getSessionsRoot(): string {
  return SESSIONS_ROOT
}

async function linkOrCopy(source: string, target: string, isDir: boolean): Promise<void> {
  if (existsSync(target)) {
    try {
      const st = await lstat(target)
      if (st.isSymbolicLink()) return
      // Stale file/dir — remove and recreate to keep in sync
      await rm(target, { recursive: true, force: true })
    } catch {
      return
    }
  }
  try {
    await symlink(source, target, isDir ? 'dir' : 'file')
    return
  } catch {
    // Fall back: copy. Symlinks fail on Windows without admin and on
    // exotic filesystems.
  }
  if (isDir) {
    await cp(source, target, { recursive: true, force: true, errorOnExist: false })
  } else {
    await copyFile(source, target)
  }
}
