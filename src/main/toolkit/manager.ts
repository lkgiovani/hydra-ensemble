import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { getStore, patchStore } from '../store'
import type { ToolkitItem, ToolkitRunResult } from '../../shared/types'

const DEFAULT_TOOLKIT: ToolkitItem[] = [
  { id: 'test', label: 'Test', command: 'npm test', icon: 'beaker', group: 'verify' },
  { id: 'build', label: 'Build', command: 'npm run build', icon: 'hammer', group: 'verify' },
  { id: 'lint', label: 'Lint', command: 'npm run lint', icon: 'wand', group: 'verify' },
  { id: 'typecheck', label: 'Typecheck', command: 'npm run typecheck', icon: 'fileCheck', group: 'verify' },
  { id: 'install', label: 'Install', command: 'npm install', icon: 'package', group: 'deps' },
  { id: 'dev', label: 'Dev server', command: 'npm run dev', icon: 'play', group: 'run' },
  { id: 'commit-push', label: 'Commit & Push', command: 'git add -A && git commit -m "wip" && git push', icon: 'send', group: 'git' },
  { id: 'status', label: 'Git status', command: 'git status', icon: 'gitBranch', group: 'git' }
]

const RUN_TIMEOUT_MS = 30_000

export class ToolkitService {
  /**
   * Returns the persisted toolkit. If the store has no toolkit
   * configured yet, seed defaults and return them.
   */
  list(): ToolkitItem[] {
    const items = getStore().toolkit
    if (items.length === 0) {
      patchStore({ toolkit: DEFAULT_TOOLKIT })
      return [...DEFAULT_TOOLKIT]
    }
    return items
  }

  save(items: ToolkitItem[]): void {
    patchStore({ toolkit: items })
  }

  /**
   * Spawns the configured command via the user's default shell. Captures
   * stdout/stderr and returns within a 30s hard timeout.
   */
  async run(id: string, cwd: string): Promise<ToolkitRunResult> {
    const item = this.list().find((i) => i.id === id)
    if (!item) {
      return {
        exitCode: -1,
        stdout: '',
        stderr: `toolkit item "${id}" not found`,
        durationMs: 0
      }
    }

    const startedAt = Date.now()
    const workingDir =
      cwd && isAbsolute(cwd) && existsSync(cwd) ? cwd : homedir()

    const { shell, args } = buildShellInvocation(item.command)

    return await new Promise<ToolkitRunResult>((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      let timer: NodeJS.Timeout | null = null

      let child
      try {
        child = spawn(shell, args, {
          cwd: workingDir,
          env: process.env,
          windowsHide: true
        })
      } catch (err) {
        resolve({
          exitCode: -1,
          stdout: '',
          stderr: `spawn failed: ${(err as Error).message}`,
          durationMs: Date.now() - startedAt
        })
        return
      }

      const finalize = (exitCode: number, errStr?: string): void => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        resolve({
          exitCode,
          stdout,
          stderr: errStr ? (stderr ? `${stderr}\n${errStr}` : errStr) : stderr,
          durationMs: Math.max(1, Date.now() - startedAt)
        })
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', (err) => {
        finalize(-1, `process error: ${err.message}`)
      })
      child.on('close', (code, signal) => {
        const exit = code ?? (signal ? 130 : -1)
        finalize(exit)
      })

      timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
        finalize(124, `timeout after ${RUN_TIMEOUT_MS}ms`)
      }, RUN_TIMEOUT_MS)
    })
  }
}

function buildShellInvocation(command: string): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    const shell = process.env['COMSPEC'] ?? 'cmd.exe'
    return { shell, args: ['/d', '/s', '/c', command] }
  }
  const shell = process.env['SHELL'] ?? '/bin/bash'
  return { shell, args: ['-lc', command] }
}
