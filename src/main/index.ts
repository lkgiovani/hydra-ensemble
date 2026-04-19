import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PtyManager } from './pty/manager'
import { SessionManager } from './session/manager'
import { registerPtyIpc } from './ipc/pty'
import { registerClaudeIpc } from './ipc/claude'
import { registerSessionIpc } from './ipc/session'
import { initStore } from './store'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ptyManager = new PtyManager()
let sessionManager: SessionManager | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d0d0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  ptyManager.attachWindow(win)
  sessionManager?.attachWindow(win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  initStore()
  sessionManager = new SessionManager(ptyManager)
  registerPtyIpc(ptyManager)
  registerClaudeIpc()
  registerSessionIpc(sessionManager)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void sessionManager?.destroyAll()
  ptyManager.killAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void sessionManager?.destroyAll()
  ptyManager.killAll()
})
