import { ipcMain } from 'electron'
import type { NotificationService } from '../notifications/manager'
import type { NotifyOptions } from '../../shared/types'

export function registerNotifyIpc(service: NotificationService): void {
  ipcMain.handle('notify:show', (_evt, payload: NotifyOptions) => {
    service.show(payload)
  })
}
