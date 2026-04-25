import { useEffect, useState } from 'react'
import { useSessions } from '../state/sessions'
import { useToolkit } from '../state/toolkit'
import { useProjects } from '../state/projects'
import { useTranscripts } from '../state/transcripts'
import { useOrchestra } from '../orchestra/state/orchestra'
import { useEditor } from '../state/editor'
import { useToasts } from '../state/toasts'

/** Trim a path to its basename for toast titles. Handles both POSIX and
 *  Windows separators, falls back to the raw string for degenerate input. */
function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

/**
 * Single boot pipeline for the classic renderer.
 *
 * Previously App.tsx fired six init calls in an ad-hoc useEffect with
 * no lifecycle owner, no ordering guarantees, and no central place to
 * add telemetry. Consolidating here keeps App.tsx about composition
 * and gives us one surface to layer retry / readiness / error handling
 * onto later without chasing a useEffect through 800 lines.
 *
 * Returns the resolved `claude` binary path (or null when the CLI
 * isn't installed) so the shell can show the right CTA/help copy.
 */
export function useBootstrap(): string | null | undefined {
  const initSessions = useSessions((s) => s.init)
  const initToolkit = useToolkit((s) => s.init)
  const initProjects = useProjects((s) => s.init)
  const initTranscripts = useTranscripts((s) => s.init)
  const initOrchestra = useOrchestra((s) => s.init)

  const [claudePath, setClaudePath] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    void initSessions()
    void initToolkit()
    void initProjects()
    initTranscripts()
    void initOrchestra()
    void window.api.claude.resolvePath().then(setClaudePath)

    // Editor file-watcher bridge. Wired ONCE for the lifetime of the
    // renderer — the FileWatcher in main is shared across windows, and
    // here we route its events into the editor store. Three branches:
    //   1. expectedHash hit → our own save round-tripped through chokidar;
    //      drop the marker and ignore.
    //   2. clean buffer → silently reload + emit a toast so the user
    //      knows another tool touched the file.
    //   3. dirty buffer → record an externalChange so the conflict
    //      banner in CodeEditor surfaces the user's choice.
    const offChanged = window.api.editor.onFileChanged((evt) => {
      const store = useEditor.getState()
      const isOpen = store.openFiles.some((f) => f.path === evt.path)
      if (!isOpen) return
      const expected = store.expectedHash[evt.path]
      if (expected && expected === evt.hash) {
        // Loop guard hit — clear the marker, ignore the event.
        useEditor.setState((s) => {
          const next = { ...s.expectedHash }
          delete next[evt.path]
          return { expectedHash: next }
        })
        return
      }
      if (!store.isDirty(evt.path)) {
        void store.applyExternalReload(evt.path).then(() => {
          useToasts.getState().push({
            kind: 'info',
            title: `Reloaded ${basename(evt.path)} from disk`,
            body: 'External change detected — buffer was clean, refreshed silently.'
          })
        })
        return
      }
      store.setExternalChange(evt.path, {
        mtime: evt.mtime,
        hash: evt.hash,
        at: Date.now()
      })
    })

    const offDeleted = window.api.editor.onFileDeleted((evt) => {
      const store = useEditor.getState()
      const isOpen = store.openFiles.some((f) => f.path === evt.path)
      if (!isOpen) return
      store.setExternalChange(evt.path, {
        mtime: 0,
        hash: '',
        at: Date.now(),
        deleted: true
      })
    })

    return () => {
      offChanged()
      offDeleted()
    }
  }, [
    initSessions,
    initToolkit,
    initProjects,
    initTranscripts,
    initOrchestra
  ])

  return claudePath
}
