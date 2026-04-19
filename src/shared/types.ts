export interface PtySpawnOptions {
  sessionId: string
  cwd: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cols: number
  rows: number
}

export type PtySpawnResult = { ok: true } | { ok: false; error: string }

export interface PtyDataEvent {
  sessionId: string
  data: string
}

export interface PtyExitEvent {
  sessionId: string
  exitCode: number
  signal?: number
}

export interface SessionMeta {
  id: string
  name: string
  cwd: string
  worktreePath?: string
  branch?: string
  claudeConfigDir: string
  createdAt: string
  ptyId: string
  // Live state (Phase 4 will populate)
  state?: SessionState
  cost?: number
  tokensIn?: number
  tokensOut?: number
  model?: string
}

export type SessionState =
  | 'idle'
  | 'thinking'
  | 'generating'
  | 'userInput'
  | 'needsAttention'

export interface SessionCreateOptions {
  name?: string
  cwd?: string
  worktreePath?: string
  branch?: string
  cols: number
  rows: number
  /** If true, only spawn shell — don't auto-launch claude. */
  shellOnly?: boolean
}

export type SessionCreateResult =
  | { ok: true; session: SessionMeta }
  | { ok: false; error: string }

export interface HydraEnsembleApi {
  pty: {
    write: (sessionId: string, data: string) => Promise<void>
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>
    onData: (handler: (event: PtyDataEvent) => void) => () => void
    onExit: (handler: (event: PtyExitEvent) => void) => () => void
  }
  session: {
    create: (opts: SessionCreateOptions) => Promise<SessionCreateResult>
    destroy: (id: string) => Promise<void>
    list: () => Promise<SessionMeta[]>
    onChange: (handler: (sessions: SessionMeta[]) => void) => () => void
  }
  claude: {
    resolvePath: () => Promise<string | null>
  }
  platform: {
    os: Platform
  }
}

export type Platform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

declare global {
  interface Window {
    api: HydraEnsembleApi
  }
}

export {}
