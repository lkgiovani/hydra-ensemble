import { BrowserWindow, ipcMain } from 'electron'
import type { ProjectService } from '../project/manager'

/**
 * Wire up `api.project.*` IPC channels. Naming mirrors the renderer-facing
 * surface declared in `src/shared/types.ts`:
 *
 *   project:list, project:add, project:remove,
 *   project:pickDirectory, project:setCurrent, project:current
 *
 * The service emits `project:changed` to all attached renderers when the list
 * mutates.
 */
export function registerProjectIpc(service: ProjectService): void {
  ipcMain.handle('project:list', () => service.list())

  ipcMain.handle('project:add', (_evt, path: string) => service.add(path))

  ipcMain.handle('project:remove', (_evt, path: string) => {
    service.remove(path)
  })

  ipcMain.handle('project:pickDirectory', (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    return service.pickDirectory(win)
  })

  ipcMain.handle('project:setCurrent', (_evt, path: string) => {
    service.setCurrent(path)
  })

  ipcMain.handle('project:current', () => service.current())
}
