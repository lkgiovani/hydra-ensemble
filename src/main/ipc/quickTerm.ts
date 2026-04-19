import { ipcMain } from 'electron'
import type { QuickTermService } from '../quickTerm/manager'

/**
 * Register IPC handlers for the floating quick-terminal window.
 * Channel name matches the `api.quickTerm` surface declared in
 * `src/shared/types.ts`.
 */
export function registerQuickTermIpc(svc: QuickTermService): void {
  ipcMain.handle('quickTerm:toggle', () => {
    svc.toggle()
  })
}
