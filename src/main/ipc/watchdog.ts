import { ipcMain } from 'electron'
import type { WatchdogService } from '../watchdog/manager'
import type { WatchdogRule } from '../../shared/types'

export function registerWatchdogIpc(service: WatchdogService): void {
  ipcMain.handle('watchdog:list', () => service.list())
  ipcMain.handle('watchdog:save', (_evt, payload: { rules: WatchdogRule[] }) => {
    service.save(payload.rules)
  })
}
