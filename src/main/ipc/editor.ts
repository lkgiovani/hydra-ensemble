import { ipcMain } from 'electron'
import type { EditorFs } from '../editor/fs-bridge'

/**
 * Register IPC handlers for the editor file-system bridge. Channel names
 * match the `api.editor` surface declared in `src/shared/types.ts`.
 */
export function registerEditorIpc(fs: EditorFs): void {
  ipcMain.handle('editor:readFile', (_evt, path: string) => fs.readFile(path))
  ipcMain.handle('editor:listDir', (_evt, path: string) => fs.listDir(path))
  ipcMain.handle(
    'editor:writeFile',
    (_evt, payload: { path: string; content: string }) =>
      fs.writeFile(payload.path, payload.content)
  )
}
