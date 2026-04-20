import { create } from 'zustand'
import type { FileContent } from '../../shared/types'

interface EditorState {
  openFiles: FileContent[]
  activeFilePath: string | null
  editorOpen: boolean
  /** When set, the editor's file tree is rooted HERE instead of the active
   *  session's worktree. Used to pin the editor to `.claude/` after the
   *  user clicks a file under the .claude toolkit tab. Cleared on close. */
  overrideRoot: string | null
  openEditor: () => void
  closeEditor: () => void
  toggleEditor: () => void
  openFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  setActive: (path: string) => void
  setOverrideRoot: (root: string | null) => void
  /** Replace the buffer in memory (e.g. after the user types in CodeMirror). */
  updateActiveBuffer: (text: string) => void
  /** Persist the active buffer to disk via the IPC bridge. */
  saveActive: () => Promise<void>
}

export const useEditor = create<EditorState>((set, get) => ({
  openFiles: [],
  activeFilePath: null,
  editorOpen: false,
  overrideRoot: null,

  openEditor: () => set({ editorOpen: true }),
  closeEditor: () => set({ editorOpen: false }),
  toggleEditor: () => set((s) => ({ editorOpen: !s.editorOpen })),
  setOverrideRoot: (root) => set({ overrideRoot: root }),

  openFile: async (path) => {
    const existing = get().openFiles.find((f) => f.path === path)
    if (existing) {
      set({ activeFilePath: path })
      return
    }
    try {
      const file = await window.api.editor.readFile(path)
      set((s) => ({
        openFiles: [...s.openFiles, file],
        activeFilePath: file.path
      }))
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[editor] readFile failed:', (err as Error).message)
    }
  },

  closeFile: (path) => {
    set((s) => {
      const openFiles = s.openFiles.filter((f) => f.path !== path)
      let activeFilePath = s.activeFilePath
      if (activeFilePath === path) {
        activeFilePath = openFiles[openFiles.length - 1]?.path ?? null
      }
      return { openFiles, activeFilePath }
    })
  },

  setActive: (path) => set({ activeFilePath: path }),

  updateActiveBuffer: (text) => {
    set((s) => {
      if (!s.activeFilePath) return s
      return {
        openFiles: s.openFiles.map((f) =>
          f.path === s.activeFilePath
            ? { ...f, bytes: text, encoding: 'utf-8', size: text.length }
            : f
        )
      }
    })
  },

  saveActive: async () => {
    const { openFiles, activeFilePath } = get()
    if (!activeFilePath) return
    const file = openFiles.find((f) => f.path === activeFilePath)
    if (!file || file.encoding !== 'utf-8') return
    try {
      await window.api.editor.writeFile(file.path, file.bytes)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[editor] writeFile failed:', (err as Error).message)
    }
  }
}))
