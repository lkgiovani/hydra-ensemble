import { ipcMain } from 'electron'
import type { WorktreeService } from '../git/worktree'

/**
 * Register IPC handlers for git/worktree operations. Channel names match the
 * `api.git` surface declared in `src/shared/types.ts`.
 */
export function registerGitIpc(svc: WorktreeService): void {
  ipcMain.handle('git:repoRoot', (_evt, cwd: string) => svc.repoRoot(cwd))

  ipcMain.handle('git:listWorktrees', (_evt, cwd: string) => svc.listWorktrees(cwd))

  ipcMain.handle(
    'git:createWorktree',
    (_evt, payload: { repoRoot: string; name: string; baseBranch?: string }) =>
      svc.createWorktree(payload.repoRoot, payload.name, payload.baseBranch)
  )

  ipcMain.handle(
    'git:removeWorktree',
    (_evt, payload: { repoRoot: string; path: string }) =>
      svc.removeWorktree(payload.repoRoot, payload.path)
  )

  ipcMain.handle('git:listChangedFiles', (_evt, cwd: string) => svc.listChangedFiles(cwd))

  ipcMain.handle('git:currentBranch', (_evt, cwd: string) => svc.currentBranch(cwd))
}
