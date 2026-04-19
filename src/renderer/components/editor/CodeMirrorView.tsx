import { useEffect, useRef } from 'react'
import { EditorState, type Extension, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { vim, Vim } from '@replit/codemirror-vim'
import { loadLanguageFor } from './languages'

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

export default function CodeMirrorView({ path, initial, onChange, onSave, vimMode }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const vimCompartment = useRef(new Compartment())
  const saveRef = useRef(onSave)

  // keep the `:w` handler current if onSave changes between renders
  useEffect(() => {
    saveRef.current = onSave
    activeSaveHandler = () => saveRef.current()
    return () => {
      if (activeSaveHandler === (() => saveRef.current())) activeSaveHandler = null
    }
  }, [onSave])

  // One-time editor construction. Document changes after open are pushed via
  // the second effect (path change → reset doc + language).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const baseExtensions: Extension[] = [
      // Vim compartment FIRST so its keymap can override defaults when active.
      vimCompartment.current.of(vimMode ? vim() : []),
      lineNumbers(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      indentOnInput(),
      highlightSelectionMatches(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        indentWithTab,
        {
          key: 'Mod-s',
          run: () => {
            saveRef.current()
            return true
          }
        }
      ]),
      oneDark,
      // Force full height so the editor is scrollable on its own.
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' }
      }),
      langCompartment.current.of([]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          onChange(u.state.doc.toString())
        }
      })
    ]

    const state = EditorState.create({ doc: initial, extensions: baseExtensions })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Editor is constructed once per mount; subsequent path/vim/initial updates
    // flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap doc + language when the active file changes.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== initial) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: initial }
      })
    }
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
  }, [path, initial])

  // Toggle vim extension without rebuilding the editor.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: vimCompartment.current.reconfigure(vimMode ? vim() : [])
    })
  }, [vimMode])

  return (
    <div
      ref={hostRef}
      className="df-scroll h-full w-full overflow-hidden rounded-sm border border-border-soft bg-bg-1 font-mono text-sm"
    />
  )
}
