import { create } from 'zustand'
import type { FileContent } from '../../shared/types'
import { useEditorAutoSave } from './editorSettings'

/** A diff the user is previewing from the git changes panel. Rendered
 *  full-width in the main editor slot, takes priority over the normal
 *  CodeMirror buffer. Cleared when the user picks a regular file or
 *  closes the diff. */
export interface DiffPreview {
  path: string
  patch: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
}

/** External change record. Populated when the FileWatcher fires for a
 *  file we have open AND the renderer's buffer is dirty (clean buffers
 *  silently reload). The conflict banner reads this map by path. */
export interface ExternalChangeRecord {
  mtime: number
  hash: string
  at: number
  /** True when the underlying file was unlinked instead of merely
   *  modified. UI surfaces a "removed externally" message. */
  deleted?: boolean
}

interface EditorState {
  openFiles: FileContent[]
  activeFilePath: string | null
  editorOpen: boolean
  /** When set, the editor's file tree is rooted HERE instead of the active
   *  session's worktree. Used to pin the editor to `.claude/` after the
   *  user clicks a file under the .claude toolkit tab. Cleared on close. */
  overrideRoot: string | null
  /** When true, the FileTree column collapses to zero width. Toggled by
   *  the editor.toggleSidebar keybinding. Persists for the session only. */
  sidebarCollapsed: boolean
  /** Open diff tabs. Each click in the git changes panel appends (or
   *  upserts) into this list so the user can flip between several diffs
   *  the same way they flip between file tabs. Persists across sidebar
   *  tab changes (Files ↔ Changes). */
  openDiffs: DiffPreview[]
  /** Path of the currently-active diff tab, or null if no diff is open /
   *  the user is focused on a file tab. */
  activeDiffPath: string | null
  /** Which tab family the editor's main slot is rendering: the file
   *  buffer (activeFilePath) or the diff preview (activeDiffPath). Kept
   *  explicit so we can keep both lists mounted and let the user switch
   *  between them without losing state. */
  activeKind: 'file' | 'diff'
  /** Map of file path → unified diff patch. Populated from
   *  GitChangesPanel when the user clicks a changed file. CodeMirrorView
   *  reads the current file's patch and paints gutter + line marks. */
  fileDiffs: Record<string, string>
  /** Snapshot of the on-disk bytes for each open file. Populated when we
   *  read and when we save. The dirty state is a pure derivation: a file
   *  is dirty iff `openFile.bytes !== savedBytes[openFile.path]`. Kept
   *  separate from `openFiles` so per-keystroke updates don't have to
   *  clone a potentially large original string. */
  savedBytes: Record<string, string>
  /** Active external-change conflicts. Populated when the FileWatcher
   *  fires for a path we have open AND the buffer is dirty. Cleared
   *  when the user resolves the conflict (reload disk / keep mine). */
  externalChange: Record<string, ExternalChangeRecord>
  /** Expected post-save sha1 per path. Set from `markExpectedHash`
   *  immediately before a writeFile round-trip; cleared when the
   *  resulting watcher event arrives or after a 2s timeout. The watcher
   *  consumer compares incoming hashes against this map to break the
   *  save → watcher → reload feedback loop. */
  expectedHash: Record<string, string>
  /** Bumped every time `applyExternalReload` lands new bytes for a path.
   *  CodeMirrorView watches this and dispatches a single doc replacement
   *  to the live EditorView so history/scroll are preserved. */
  externalReloadNonce: Record<string, number>
  /** Whether the active buffer has unsaved edits. Derived — consumers
   *  call `get().isDirty(path)` rather than subscribing to a flag, so
   *  the computation stays cheap and consistent with the live buffer. */
  isDirty: (path?: string | null) => boolean
  openEditor: () => void
  closeEditor: () => void
  toggleEditor: () => void
  toggleSidebar: () => void
  /** Open `path` in the editor. Returns the RESOLVED absolute path (after
   *  the fs bridge's realpath canonicalisation) so callers can key other
   *  state — e.g. fileDiffs — against whatever CodeMirror will actually
   *  see as `activeFilePath`. Returns null when the read fails. */
  openFile: (path: string) => Promise<string | null>
  closeFile: (path: string) => void
  closeAllFiles: () => void
  setActive: (path: string) => void
  setOverrideRoot: (root: string | null) => void
  /** Upsert a diff into the tab list and focus it. Re-clicking the same
   *  path refreshes its patch instead of stacking duplicates. */
  openDiff: (preview: DiffPreview) => void
  /** Remove a diff tab. If it was active, fall back to the last remaining
   *  diff tab, or — if none — switch activeKind back to 'file'. */
  closeDiff: (path: string) => void
  /** Focus an already-open diff tab. */
  setActiveDiff: (path: string) => void
  /** Drop every diff tab at once. Used when the cwd changes, since diffs
   *  from a different working tree no longer apply. */
  closeAllDiffs: () => void
  setFileDiff: (path: string, patch: string | null) => void
  clearFileDiffs: () => void
  /** Replace the buffer in memory (e.g. after the user types in CodeMirror). */
  updateActiveBuffer: (text: string) => void
  /** Persist the active buffer to disk via the IPC bridge. */
  saveActive: () => Promise<void>
  /** Re-read `path` from disk and use the result as the new buffer +
   *  baseline. Drops the externalChange entry. */
  applyExternalReload: (path: string) => Promise<void>
  /** Drop the externalChange entry for `path` without touching the
   *  buffer. The user chose "keep mine". */
  dismissExternalChange: (path: string) => void
  /** Mark a hash the next watcher event for `path` should be ignored
   *  for. Used by saveActive to break the save → watcher → reload loop.
   *  Auto-clears after 2 seconds in case the watcher event is dropped. */
  markExpectedHash: (path: string, hash: string) => void
  /** Setter for an external-change record. */
  setExternalChange: (path: string, record: ExternalChangeRecord) => void
}

/** Browser-side sha1 helper. Uses SubtleCrypto when available (always in
 *  Electron renderer) and falls back to a deterministic empty string in
 *  weird sandboxed contexts. The hash exists purely so saveActive can
 *  break the chokidar feedback loop — if we can't compute it we just
 *  trust the writeFile result. */
async function sha1Hex(text: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode(text)
    const buf = await crypto.subtle.digest('SHA-1', enc)
    const bytes = new Uint8Array(buf)
    let hex = ''
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i] ?? 0
      hex += byte.toString(16).padStart(2, '0')
    }
    return hex
  } catch {
    return ''
  }
}

/** Module-level timer registry for expectedHash auto-clear. Kept off the
 *  store so callers don't accidentally serialize it. */
const expectedHashTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Per-path debounce timers for auto-save. Lives outside the store for
 *  the same reason as expectedHashTimers — these are timers, not state. */
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Lightweight glob matcher mirrored from CodeMirrorView's autosave
 *  exclude check, kept here so the debounce path doesn't need to import
 *  the view component. Patterns supported:
 *    - exact basename, `*.lock`, `<prefix>*`, `<dir>/**`. */
function matchesGlob(path: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false
  const isWin = path.includes('\\')
  const sep = isWin ? '\\' : '/'
  const segs = path.split(/[\\/]/).filter(Boolean)
  const base = segs[segs.length - 1] ?? path
  const norm = (s: string): string => (isWin ? s.toLowerCase() : s)
  for (const raw of patterns) {
    const pattern = raw.trim()
    if (!pattern) continue
    if (pattern.endsWith('/**')) {
      const dir = pattern.slice(0, -3)
      const needle = `${sep}${dir}${sep}`
      if (norm(path).includes(norm(needle))) return true
      if (norm(path).startsWith(norm(`${dir}${sep}`))) return true
      continue
    }
    if (pattern.startsWith('*.')) {
      if (norm(base).endsWith(norm(pattern.slice(1)))) return true
      continue
    }
    if (pattern.endsWith('*')) {
      if (norm(base).startsWith(norm(pattern.slice(0, -1)))) return true
      continue
    }
    if (norm(base) === norm(pattern)) return true
  }
  return false
}

export const useEditor = create<EditorState>((set, get) => ({
  openFiles: [],
  activeFilePath: null,
  editorOpen: false,
  overrideRoot: null,
  sidebarCollapsed: false,
  openDiffs: [],
  activeDiffPath: null,
  activeKind: 'file',
  fileDiffs: {},
  savedBytes: {},
  externalChange: {},
  expectedHash: {},
  externalReloadNonce: {},

  isDirty: (path) => {
    const s = get()
    const p = path ?? s.activeFilePath
    if (!p) return false
    const file = s.openFiles.find((f) => f.path === p)
    if (!file) return false
    if (file.encoding !== 'utf-8') return false
    const baseline = s.savedBytes[p]
    return baseline !== undefined && baseline !== file.bytes
  },

  openEditor: () => set({ editorOpen: true }),
  closeEditor: () => {
    // Stop watching every file we had open before tearing the buffers down.
    const paths = get().openFiles.map((f) => f.path)
    for (const p of paths) {
      void window.api.editor.unwatchFile(p).catch(() => {})
      const timer = expectedHashTimers.get(p)
      if (timer) {
        clearTimeout(timer)
        expectedHashTimers.delete(p)
      }
      const auto = autoSaveTimers.get(p)
      if (auto) {
        clearTimeout(auto)
        autoSaveTimers.delete(p)
      }
    }
    set({
      editorOpen: false,
      openDiffs: [],
      activeDiffPath: null,
      activeKind: 'file',
      fileDiffs: {},
      savedBytes: {},
      externalChange: {},
      expectedHash: {}
    })
  },
  toggleEditor: () => set((s) => ({ editorOpen: !s.editorOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setOverrideRoot: (root) => set({ overrideRoot: root }),
  openDiff: (preview) =>
    set((s) => {
      const existingIdx = s.openDiffs.findIndex((d) => d.path === preview.path)
      const openDiffs =
        existingIdx >= 0
          ? s.openDiffs.map((d, i) => (i === existingIdx ? preview : d))
          : [...s.openDiffs, preview]
      return { openDiffs, activeDiffPath: preview.path, activeKind: 'diff' }
    }),
  closeDiff: (path) =>
    set((s) => {
      const openDiffs = s.openDiffs.filter((d) => d.path !== path)
      if (s.activeDiffPath !== path) return { openDiffs }
      const fallback = openDiffs[openDiffs.length - 1]?.path ?? null
      return {
        openDiffs,
        activeDiffPath: fallback,
        activeKind: fallback ? 'diff' : 'file'
      }
    }),
  setActiveDiff: (path) =>
    set((s) =>
      s.openDiffs.some((d) => d.path === path)
        ? { activeDiffPath: path, activeKind: 'diff' }
        : s
    ),
  closeAllDiffs: () =>
    set({ openDiffs: [], activeDiffPath: null, activeKind: 'file' }),
  setFileDiff: (path, patch) =>
    set((s) => {
      const next = { ...s.fileDiffs }
      if (patch === null || patch.length === 0) delete next[path]
      else next[path] = patch
      return { fileDiffs: next }
    }),
  clearFileDiffs: () => set({ fileDiffs: {} }),

  openFile: async (path) => {
    // Fast path: already open by literal (resolved) path. Most callers
    // hit this — the file tree + tabs both hand us the canonical path.
    const existing = get().openFiles.find((f) => f.path === path)
    if (existing) {
      set({ activeFilePath: path, activeKind: 'file' })
      return existing.path
    }
    try {
      const file = await window.api.editor.readFile(path)
      // Dedupe on the RESOLVED path too — the git changes panel hands us
      // `cwd/relative`, which may differ from the symlink-resolved realpath
      // we store. Without this second check, clicking the same changed
      // file twice would stack duplicate tabs.
      let alreadyOpen = false
      set((s) => {
        const baseline =
          file.encoding === 'utf-8'
            ? { ...s.savedBytes, [file.path]: file.bytes }
            : s.savedBytes
        if (s.openFiles.some((f) => f.path === file.path)) {
          alreadyOpen = true
          return {
            activeFilePath: file.path,
            activeKind: 'file',
            savedBytes: baseline
          }
        }
        return {
          openFiles: [...s.openFiles, file],
          activeFilePath: file.path,
          activeKind: 'file',
          savedBytes: baseline
        }
      })
      // Subscribe the FileWatcher to this path on the FIRST open. A
      // re-open is a no-op — we already have a subscription.
      if (!alreadyOpen) {
        void window.api.editor.watchFile(file.path).catch(() => {})
      }
      return file.path
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[editor] readFile failed:', (err as Error).message)
      return null
    }
  },

  closeFile: (path) => {
    set((s) => {
      const openFiles = s.openFiles.filter((f) => f.path !== path)
      let activeFilePath = s.activeFilePath
      if (activeFilePath === path) {
        activeFilePath = openFiles[openFiles.length - 1]?.path ?? null
      }
      const savedBytes = { ...s.savedBytes }
      delete savedBytes[path]
      const externalChange = { ...s.externalChange }
      delete externalChange[path]
      const expectedHash = { ...s.expectedHash }
      delete expectedHash[path]
      return { openFiles, activeFilePath, savedBytes, externalChange, expectedHash }
    })
    void window.api.editor.unwatchFile(path).catch(() => {})
    const timer = expectedHashTimers.get(path)
    if (timer) {
      clearTimeout(timer)
      expectedHashTimers.delete(path)
    }
    const auto = autoSaveTimers.get(path)
    if (auto) {
      clearTimeout(auto)
      autoSaveTimers.delete(path)
    }
  },

  closeAllFiles: () => {
    const paths = get().openFiles.map((f) => f.path)
    for (const p of paths) {
      void window.api.editor.unwatchFile(p).catch(() => {})
      const timer = expectedHashTimers.get(p)
      if (timer) {
        clearTimeout(timer)
        expectedHashTimers.delete(p)
      }
      const auto = autoSaveTimers.get(p)
      if (auto) {
        clearTimeout(auto)
        autoSaveTimers.delete(p)
      }
    }
    set({
      openFiles: [],
      activeFilePath: null,
      savedBytes: {},
      externalChange: {},
      expectedHash: {}
    })
  },

  setActive: (path) => set({ activeFilePath: path, activeKind: 'file' }),

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
    // Debounced auto-save. Skipped entirely when:
    //   - the toggle is off
    //   - mode is 'onBlur' only (blur path lives in CodeMirrorView)
    //   - the path matches an exclude glob (.env, lockfiles, etc)
    //   - there's an unresolved external conflict (saveActive guards
    //     this too, but short-circuiting the timer keeps the renderer
    //     from queueing dozens of no-op writes during conflicts).
    const cfg = useEditorAutoSave.getState()
    if (!cfg.enabled) return
    if (cfg.mode !== 'debounce' && cfg.mode !== 'both') return
    const path = get().activeFilePath
    if (!path) return
    if (matchesGlob(path, cfg.excludeGlobs)) return
    const existing = autoSaveTimers.get(path)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      autoSaveTimers.delete(path)
      const live = get()
      // Re-check predicates at fire time. The user may have switched
      // tabs, dismissed the buffer, fixed the file out-of-band — any
      // of those should cancel the queued write.
      if (live.activeFilePath !== path) return
      if (!live.isDirty(path)) return
      if (live.externalChange[path]) return
      void live.saveActive()
    }, cfg.debounceMs)
    autoSaveTimers.set(path, timer)
  },

  saveActive: async () => {
    const { openFiles, activeFilePath, externalChange } = get()
    if (!activeFilePath) return
    const file = openFiles.find((f) => f.path === activeFilePath)
    if (!file || file.encoding !== 'utf-8') return
    // Block save while there's an unresolved external conflict — saving
    // here would silently overwrite whatever the other writer just put
    // on disk. Manual save remains possible; this only short-circuits
    // the auto-save / saveActive entrypoints.
    if (externalChange[file.path]) return
    const contentAtSave = file.bytes
    // Mark expected hash BEFORE the IPC round-trip. The chokidar event
    // for our own write may arrive before writeFile resolves — without
    // this guard the watcher consumer would see "external change" for
    // the bytes we just put there and pop a phantom conflict banner.
    const hash = await sha1Hex(contentAtSave)
    if (hash) get().markExpectedHash(file.path, hash)
    try {
      const result = await window.api.editor.writeFile(file.path, contentAtSave)
      // If the bridge returned its own hash and it diverges, log a warning
      // — most likely a buggy adapter, since we both ran sha1 over the
      // same UTF-8 string. Keep going either way: writeFile is the
      // authoritative on-disk state.
      if (hash && result.hash && result.hash !== hash) {
        // eslint-disable-next-line no-console
        console.warn(
          '[editor] save hash mismatch (renderer vs main); using main hash:',
          { renderer: hash, main: result.hash }
        )
        get().markExpectedHash(file.path, result.hash)
      }
      // Baseline advances to whatever we just wrote. If the user typed
      // more characters between the dispatch and the IPC round-trip,
      // `contentAtSave` reflects what's ON DISK — NOT the current buffer
      // — so the dirty flag stays accurate (they still have unsaved
      // edits relative to disk).
      set((s) => ({
        savedBytes: { ...s.savedBytes, [file.path]: contentAtSave }
      }))
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[editor] writeFile failed:', (err as Error).message)
    }
  },

  applyExternalReload: async (path) => {
    try {
      const file = await window.api.editor.readFile(path)
      set((s) => {
        const openFiles = s.openFiles.map((f) =>
          f.path === path ? file : f
        )
        const savedBytes =
          file.encoding === 'utf-8'
            ? { ...s.savedBytes, [path]: file.bytes }
            : s.savedBytes
        const externalChange = { ...s.externalChange }
        delete externalChange[path]
        const externalReloadNonce = {
          ...s.externalReloadNonce,
          [path]: (s.externalReloadNonce[path] ?? 0) + 1
        }
        return { openFiles, savedBytes, externalChange, externalReloadNonce }
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[editor] applyExternalReload failed:', (err as Error).message)
    }
  },

  dismissExternalChange: (path) => {
    set((s) => {
      if (!s.externalChange[path]) return s
      const externalChange = { ...s.externalChange }
      delete externalChange[path]
      return { externalChange }
    })
  },

  markExpectedHash: (path, hash) => {
    set((s) => ({ expectedHash: { ...s.expectedHash, [path]: hash } }))
    const existing = expectedHashTimers.get(path)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      expectedHashTimers.delete(path)
      set((s) => {
        if (s.expectedHash[path] !== hash) return s
        const next = { ...s.expectedHash }
        delete next[path]
        return { expectedHash: next }
      })
    }, 2000)
    expectedHashTimers.set(path, timer)
  },

  setExternalChange: (path, record) => {
    set((s) => ({ externalChange: { ...s.externalChange, [path]: record } }))
  }
}))
