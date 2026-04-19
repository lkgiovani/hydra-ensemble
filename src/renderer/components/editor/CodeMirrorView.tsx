import { useEffect, useRef } from 'react'
import { EditorState, type Extension, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
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
}

export default function CodeMirrorView({ path, initial, onChange, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())

  // One-time editor construction. Document changes after open are pushed via
  // the second effect (path change → reset doc + language).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const baseExtensions: Extension[] = [
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
            onSave()
            return true
          }
        }
      ]),
      oneDark,
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
    // We intentionally only construct once per mount; subsequent path/initial
    // updates are handled by the next effect.
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

  return (
    <div
      ref={hostRef}
      className="df-scroll h-full w-full overflow-hidden rounded-md border border-border-soft bg-bg-1 font-mono text-sm"
    />
  )
}
