import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Persisted editor preferences that aren't tied to an open file:
 *   - auto-save (off by default; opt-in via the session quick-settings UI)
 *   - vim mode (off by default; toggleable via the editor toolbar)
 *
 * Kept in its own store so the main editor.ts state doesn't get a
 * persist envelope — that would force every per-buffer field through
 * localStorage on every keystroke, which we don't want.
 */

export type AutoSaveMode = 'debounce' | 'onBlur' | 'both'

export interface AutoSaveConfig {
  enabled: boolean
  mode: AutoSaveMode
  debounceMs: number
  excludeGlobs: string[]
}

interface AutoSaveState extends AutoSaveConfig {
  setAutoSave: (patch: Partial<AutoSaveConfig>) => void
}

export const AUTO_SAVE_DEFAULTS: AutoSaveConfig = {
  enabled: false,
  mode: 'both',
  debounceMs: 1500,
  excludeGlobs: ['.env*', '*.lock', '.git/**']
}

export const AUTO_SAVE_DEBOUNCE_MIN = 500
export const AUTO_SAVE_DEBOUNCE_MAX = 5000

export const useEditorAutoSave = create<AutoSaveState>()(
  persist(
    (set) => ({
      ...AUTO_SAVE_DEFAULTS,
      setAutoSave: (patch) => {
        set((s) => ({
          ...s,
          ...patch,
          // Clamp debounce to sensible bounds. The slider already
          // enforces this, but a stale persisted value (e.g. from a
          // prior schema) shouldn't break the timer math.
          debounceMs:
            patch.debounceMs !== undefined
              ? Math.min(
                  AUTO_SAVE_DEBOUNCE_MAX,
                  Math.max(AUTO_SAVE_DEBOUNCE_MIN, patch.debounceMs)
                )
              : s.debounceMs
        }))
      }
    }),
    { name: 'hydra.editor.autoSave' }
  )
)

interface VimState {
  /** Persisted opt-in for vim modal bindings. Off by default — user
   *  flips it via the toolbar pill in CodeEditor. */
  vimMode: boolean
  setVimMode: (value: boolean) => void
  toggleVimMode: () => void
}

export const useEditorVim = create<VimState>()(
  persist(
    (set) => ({
      vimMode: false,
      setVimMode: (value) => set({ vimMode: value }),
      toggleVimMode: () => set((s) => ({ vimMode: !s.vimMode }))
    }),
    { name: 'hydra.editor.vim' }
  )
)

/** Per-session FileTree expansion memory. Not persisted — the cwd map
 *  is large and rebuilding it on next launch is cheap. */
interface ExpandedState {
  /** sessionId → array of expanded folder paths */
  expandedBySession: Record<string, string[]>
  setExpanded: (sessionId: string, paths: string[]) => void
}

export const useEditorExpansion = create<ExpandedState>((set) => ({
  expandedBySession: {},
  setExpanded: (sessionId, paths) =>
    set((s) => ({
      expandedBySession: { ...s.expandedBySession, [sessionId]: paths }
    }))
}))
