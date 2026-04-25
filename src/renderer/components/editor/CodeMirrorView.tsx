import { useEffect, useRef } from 'react'
import { EditorState, type Extension, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleComment
} from '@codemirror/commands'
import {
  highlightSelectionMatches,
  search,
  selectMatches,
  selectNextOccurrence
} from '@codemirror/search'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { vim, Vim } from '@replit/codemirror-vim'
import { loadLanguageFor } from './languages'
import { clearDiffPatch, diffExtension, setDiffPatch } from './diff-extension'
import { useEditor } from '../../state/editor'
import { useEditorAutoSave } from '../../state/editorSettings'

/**
 * Module-level holder for the currently-mounted editor's view. Consumed
 * by the custom InlineSearch component to drive find/replace against
 * whichever file is active, and by the shell to focus the editor after
 * closing search. A single CodeMirror view is live at a time so the
 * singleton is safe. We deliberately do NOT bundle @codemirror/search's
 * default UI — the built-in panel was too far off the rest of the app's
 * styling and the user rejected it.
 */
let activeView: EditorView | null = null

export function getActiveView(): EditorView | null {
  return activeView
}

interface Props {
  /** File path — used to pick a language extension. */
  path: string
  /** Initial document text. */
  initial: string
  /** Called on every doc change. */
  onChange: (text: string) => void
  /** Cmd/Ctrl+S handler. */
  onSave: () => void
  /** When true, vim modal bindings (normal / insert / visual / command) are on. */
  vimMode?: boolean
  /** Unified diff patch for the file, if any. Used to paint green/red
   *  gutter markers + line backgrounds while the user edits. Pass null
   *  or undefined to clear. */
  diffPatch?: string | null
  /** Fires whenever the user selection changes. Parent uses it to
   *  enable/disable a Copy toolbar button. */
  onSelectionChange?: (hasSelection: boolean) => void
}

/**
 * Lightweight glob matcher for the auto-save exclusion list. Supports the
 * narrow set of patterns the user is realistically going to put there:
 *   - exact basename match (e.g. `package-lock.json`)
 *   - extension-only globs (`*.lock`)
 *   - prefix globs (`.env*`)
 *   - `<dir>/**` directory matches (e.g. `.git/**`)
 *
 * Anything fancier should be filtered by the user upstream — wiring
 * minimatch in here just to handle the long tail isn't worth the bundle
 * cost. Comparison is case-sensitive on POSIX, case-insensitive on
 * Windows (cheap normalisation: lowercase both sides).
 */
export function matchesAutoSaveExclude(path: string, patterns: readonly string[]): boolean {
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
      // Match when the directory IS the path's anchor.
      if (norm(path).startsWith(norm(`${dir}${sep}`))) return true
      continue
    }
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1) // ".lock"
      if (norm(base).endsWith(norm(ext))) return true
      continue
    }
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      if (norm(base).startsWith(norm(prefix))) return true
      continue
    }
    if (norm(base) === norm(pattern)) return true
  }
  return false
}

// Wire the `:w` Ex command once per module to save the active file via the
// CodeMirrorView's onSave prop. Stored in a module-local holder so the
// handler can pick the right callback for the currently-mounted view.
let activeSaveHandler: (() => void) | null = null
Vim.defineEx('w', 'w', () => {
  activeSaveHandler?.()
})
Vim.defineEx('write', 'write', () => {
  activeSaveHandler?.()
})

export default function CodeMirrorView({ path, initial, onChange, onSave, vimMode, diffPatch, onSelectionChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const vimCompartment = useRef(new Compartment())
  const saveRef = useRef(onSave)
  const selCbRef = useRef(onSelectionChange)
  selCbRef.current = onSelectionChange

  // keep the `:w` handler current if onSave changes between renders.
  // Store a *stable* bridge in the module-level holder and point it at the
  // live ref. Previously the cleanup built a NEW arrow to compare against —
  // always unequal, so the holder was never cleared, leaking closures.
  useEffect(() => {
    saveRef.current = onSave
  })
  useEffect(() => {
    const bridge = (): void => saveRef.current()
    activeSaveHandler = bridge
    return () => {
      if (activeSaveHandler === bridge) activeSaveHandler = null
    }
  }, [])

  // One-time editor construction. Document changes after open are pushed via
  // the second effect (path change → reset doc + language).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const baseExtensions: Extension[] = [
      // Vim compartment FIRST so its keymap can override defaults when active.
      vimCompartment.current.of(vimMode ? vim() : []),
      lineNumbers(),
      // Diff gutter + line backgrounds — painted from the unified patch
      // dispatched via setDiffPatch / clearDiffPatch (see effect below).
      diffExtension(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      indentOnInput(),
      // Installs the SearchState StateField that setSearchQuery /
      // findNext / findPrevious / replaceNext / replaceAll from
      // @codemirror/search dispatch against. Without this extension the
      // Ctrl+F overlay pushes queries into a black hole and Enter throws,
      // which in turn lets the top-level ErrorBoundary catch + render its
      // fallback UI. We hide the built-in panel (`top: false` won't help
      // — we skip rendering their panel at all by not wiring the keymap;
      // InlineSearch drives the commands directly).
      search({ top: false }),
      highlightSelectionMatches(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
        {
          key: 'Mod-s',
          run: () => {
            saveRef.current()
            return true
          }
        },
        // Toggle line / block comment based on the active language.
        // Falls through to defaultKeymap if no language is loaded.
        {
          key: 'Mod-/',
          run: toggleComment
        },
        // VSCode-style multi-cursor "select next occurrence".
        {
          key: 'Mod-d',
          run: selectNextOccurrence
        },
        // VSCode-style "select all occurrences of current match".
        {
          key: 'Mod-Shift-l',
          run: selectMatches
        },
        // Goto-line via window.prompt — minimal but functional. Number
        // input is clamped to the document's line range; bad input is a
        // no-op so the user just gets dismissed.
        {
          key: 'Mod-g',
          run: (view) => {
            const raw = window.prompt('Go to line:')
            if (!raw) return true
            const target = Number.parseInt(raw, 10)
            if (!Number.isFinite(target) || target < 1) return true
            const max = view.state.doc.lines
            const line = view.state.doc.line(Math.min(target, max))
            view.dispatch({
              selection: { anchor: line.from },
              effects: EditorView.scrollIntoView(line.from, { y: 'center' })
            })
            view.focus()
            return true
          }
        }
      ]),
      oneDark,
      // Force full height so the editor is scrollable on its own.
      // Also override @codemirror/search's match highlights — oneDark
      // ships very subtle defaults that are invisible against the diff
      // line backgrounds. VS Code uses a strong amber box around every
      // occurrence + a hotter colour on the "current" match.
      EditorView.domEventHandlers({
        blur: () => {
          // Auto-save on blur. Pulls live config so the user can flip
          // the toggle while the editor is mounted without a remount.
          const cfg = useEditorAutoSave.getState()
          if (!cfg.enabled) return false
          if (cfg.mode !== 'onBlur' && cfg.mode !== 'both') return false
          const editor = useEditor.getState()
          if (!editor.activeFilePath) return false
          if (!editor.isDirty(editor.activeFilePath)) return false
          if (editor.externalChange[editor.activeFilePath]) return false
          if (matchesAutoSaveExclude(editor.activeFilePath, cfg.excludeGlobs)) return false
          void editor.saveActive()
          return false
        }
      }),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
        '.cm-searchMatch': {
          backgroundColor:
            'color-mix(in srgb, var(--color-status-warning) 32%, transparent)',
          outline:
            '1px solid color-mix(in srgb, var(--color-status-warning) 85%, transparent)',
          borderRadius: '2px'
        },
        '.cm-searchMatch .cm-selectionMatch': { backgroundColor: 'transparent' },
        '.cm-searchMatch-selected': {
          backgroundColor:
            'color-mix(in srgb, var(--color-accent-500) 55%, transparent)',
          outline:
            '1px solid color-mix(in srgb, var(--color-accent-500) 95%, transparent)'
        }
      }),
      langCompartment.current.of([]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          onChange(u.state.doc.toString())
        }
        if (u.selectionSet || u.docChanged) {
          const sel = u.state.selection.main
          selCbRef.current?.(sel.from !== sel.to)
        }
      })
    ]

    const state = EditorState.create({ doc: initial, extensions: baseExtensions })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    activeView = view

    return () => {
      if (activeView === view) activeView = null
      view.destroy()
      viewRef.current = null
    }
    // Editor is constructed once per mount; subsequent path/vim/initial updates
    // flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load + apply the language extension only when the PATH changes. Previously
  // this was combined with the doc-sync effect below, which made every single
  // keystroke (new `initial` prop) re-trigger loadLanguageFor + reconfigure.
  // On a large file that reconfigure is heavy enough to freeze the renderer.
  useEffect(() => {
    let cancelled = false
    void loadLanguageFor(path).then((ext) => {
      if (cancelled || !viewRef.current) return
      viewRef.current.dispatch({
        effects: langCompartment.current.reconfigure(ext ?? [])
      })
    })
    return () => {
      cancelled = true
    }
  }, [path])

  // Sync the editor doc when `initial` diverges from the in-editor content.
  // The `current !== initial` guard keeps our own updateListener round-trip
  // from replaying — when the user types we push the new string back up as
  // `initial`, and without the guard we'd dispatch it right back in.
  //
  // Path-keyed: applies on tab switch when the new file is bigger than 0
  // bytes. External reloads land via the dedicated nonce-driven effect
  // below so we can preserve the selection/history that this naive
  // overwrite would clobber.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === initial) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initial }
    })
  }, [initial])

  // External reload — fires when the editor store applies fresh bytes
  // from disk after another process changed the file. We dispatch the
  // change while preserving the selection so the user's cursor / scroll
  // / undo history survive the swap. The selection is clamped to the
  // new doc length so a shorter file doesn't leave the cursor past
  // EOF (CodeMirror would reject the dispatch otherwise).
  const reloadNonce = useEditor((s) => s.externalReloadNonce[path] ?? 0)
  useEffect(() => {
    if (reloadNonce === 0) return
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === initial) return
    const sel = view.state.selection.main
    const max = initial.length
    const anchor = Math.min(sel.anchor, max)
    const head = Math.min(sel.head, max)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initial },
      selection: { anchor, head },
      userEvent: 'external.reload'
    })
  }, [reloadNonce, initial])

  // Toggle vim extension without rebuilding the editor.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: vimCompartment.current.reconfigure(vimMode ? vim() : [])
    })
  }, [vimMode])

  // Push the diff patch into CodeMirror as an effect. Empty / null patch
  // clears the decorations so switching to a clean file shows no marks.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (diffPatch && diffPatch.trim().length > 0) {
      view.dispatch({ effects: setDiffPatch.of(diffPatch) })
    } else {
      view.dispatch({ effects: clearDiffPatch.of(null) })
    }
  }, [diffPatch])

  return (
    <div
      ref={hostRef}
      className="df-scroll h-full w-full overflow-hidden rounded-sm border border-border-soft bg-bg-1 font-mono text-sm"
    />
  )
}
