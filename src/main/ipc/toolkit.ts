import { ipcMain } from 'electron'
import type { ToolkitService } from '../toolkit/manager'
import type { ToolkitItem } from '../../shared/types'

export function registerToolkitIpc(service: ToolkitService): void {
  ipcMain.handle('toolkit:list', () => service.list())
  ipcMain.handle('toolkit:save', (_evt, payload: { items: ToolkitItem[] }) => {
    service.save(payload.items)
  })
  ipcMain.handle(
    'toolkit:run',
    (_evt, payload: { id: string; cwd: string }) => service.run(payload.id, payload.cwd)
  )
}
