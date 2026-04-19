import { contextBridge, ipcRenderer } from 'electron'
import type {
  HydraEnsembleApi,
  Platform,
  PtyDataEvent,
  PtyExitEvent,
  SessionCreateOptions,
  SessionMeta
} from '../shared/types'

const api: HydraEnsembleApi = {
  pty: {
    write: (sessionId, data) => ipcRenderer.invoke('pty:write', { sessionId, data }),
    resize: (sessionId, cols, rows) =>
      ipcRenderer.invoke('pty:resize', { sessionId, cols, rows }),
    onData: (handler) => {
      const listener = (_evt: unknown, event: PtyDataEvent): void => handler(event)
      ipcRenderer.on('pty:data', listener)
      return () => {
        ipcRenderer.removeListener('pty:data', listener)
      }
    },
    onExit: (handler) => {
      const listener = (_evt: unknown, event: PtyExitEvent): void => handler(event)
      ipcRenderer.on('pty:exit', listener)
      return () => {
        ipcRenderer.removeListener('pty:exit', listener)
      }
    }
  },
  session: {
    create: (opts: SessionCreateOptions) => ipcRenderer.invoke('session:create', opts),
    destroy: (id: string) => ipcRenderer.invoke('session:destroy', { id }),
    list: () => ipcRenderer.invoke('session:list'),
    onChange: (handler) => {
      const listener = (_evt: unknown, sessions: SessionMeta[]): void => handler(sessions)
      ipcRenderer.on('session:changed', listener)
      return () => {
        ipcRenderer.removeListener('session:changed', listener)
      }
    }
  },
  claude: {
    resolvePath: () => ipcRenderer.invoke('claude:resolvePath')
  },
  platform: {
    os: process.platform as Platform
  }
}

contextBridge.exposeInMainWorld('api', api)
