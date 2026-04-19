import { ipcMain } from 'electron'
import type { GhService } from '../gh/manager'

/**
 * Register IPC handlers for the GitHub PR inspector. Channel names match
 * the `api.gh` surface declared in `src/shared/types.ts`.
 */
export function registerGhIpc(svc: GhService): void {
  ipcMain.handle('gh:listPRs', (_evt, cwd: string) => svc.listPRs(cwd))
  ipcMain.handle(
    'gh:getPR',
    (_evt, payload: { cwd: string; number: number }) =>
      svc.getPR(payload.cwd, payload.number)
  )
}
