import { app, type BrowserWindow } from 'electron'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

let initialized = false

/**
 * Wires `electron-updater` to the main process. The updater feed is driven by
 * `publish:` in `electron-builder.yml`. With no release assets yet, every
 * check is a silent no-op — we keep failures silent in v1.
 */
export function initUpdater(window: BrowserWindow | null): void {
  if (initialized) return
  initialized = true

  // Silent in dev; the updater only runs against packaged builds.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    window?.webContents.send('updater:update-available', info)
  })
  autoUpdater.on('update-downloaded', (info) => {
    window?.webContents.send('updater:update-downloaded', info)
  })
  autoUpdater.on('error', () => {
    // Silent in v1 — surface through the renderer only when we have UI for it.
  })

  void autoUpdater.checkForUpdates().catch(() => {
    // Swallow — typical cause is no release feed yet.
  })

  // Re-check every 6 hours while the app is open.
  setInterval(
    () => {
      void autoUpdater.checkForUpdates().catch(() => {})
    },
    6 * 60 * 60 * 1000
  )
}
