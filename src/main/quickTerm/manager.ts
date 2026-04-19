import { BrowserWindow, app } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { PtyManager } from '../pty/manager'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Owns a separate, hidden BrowserWindow for the quick-terminal pop-up.
 * The window loads the same renderer bundle but with `?mode=quick` so the
 * renderer can switch to the minimal `<QuickTerminalApp />` shell. The PTY
 * is spawned on first show and reused across toggles; killed on app quit.
 */
export class QuickTermService {
  private window: BrowserWindow | null = null
  private ptyId: string | null = null
  private spawned = false
  private static readonly PTY_ID = 'quick-term'

  constructor(private readonly pty: PtyManager) {}

  toggle(): void {
    const win = this.ensureWindow()
    if (win.isVisible()) {
      win.hide()
      return
    }
    this.show(win)
  }

  destroy(): void {
    if (this.ptyId) {
      this.pty.kill(this.ptyId)
      this.ptyId = null
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
    this.spawned = false
  }

  private show(win: BrowserWindow): void {
    win.show()
    win.focus()
    if (!this.spawned) {
      // Lazy spawn the shell PTY the first time the user opens the panel.
      // The renderer (?mode=quick) wires the PTY by id via SessionPane.
      this.pty.spawn({
        sessionId: QuickTermService.PTY_ID,
        cwd: app.getPath('home'),
        cols: 100,
        rows: 28
      })
      this.ptyId = QuickTermService.PTY_ID
      this.spawned = true
    }
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    const win = new BrowserWindow({
      width: 640,
      height: 420,
      show: false,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: '#0d0d0f',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    win.setMenu(null)

    // The PTY manager only broadcasts to a single attached window; the
    // quick-term window receives data via its own attach call. We do NOT
    // call attachWindow here because that would silence the main window —
    // instead the renderer uses the same `pty:data` channel and filters by
    // sessionId, so any window that has the preload bridge will receive
    // events forwarded by ipcRenderer events that match its listener.
    // (Electron multiplexes webContents.send() to all listeners on the
    // sender side, but PtyManager only retains one window. Phase-1
    // limitation: the quick-term renderer attaches the PTY listener and
    // works because the main window forwards via the shared preload —
    // see manager.attachWindow() in main/index.ts for the multi-window
    // forwarder if/when added.)

    const url = process.env['ELECTRON_RENDERER_URL']
    if (url) {
      void win.loadURL(`${url}?mode=quick`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), {
        search: 'mode=quick'
      })
    }

    win.on('blur', () => {
      // Match the macOS quick-terminal feel: hide on blur.
      if (win.isVisible()) win.hide()
    })

    win.on('closed', () => {
      this.window = null
    })

    this.window = win
    return win
  }
}
