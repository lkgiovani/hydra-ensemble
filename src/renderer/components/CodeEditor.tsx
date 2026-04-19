import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Code2, File as FileIcon, Save, X } from 'lucide-react'
import { useEditor } from '../state/editor'
import { useSessions } from '../state/sessions'
import FileTree from './editor/FileTree'
import CodeMirrorView from './editor/CodeMirrorView'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CodeEditor({ open, onClose }: Props) {
  const sessions = useSessions((s) => s.sessions)
  const activeSessionId = useSessions((s) => s.activeId)
  const openFiles = useEditor((s) => s.openFiles)
  const activeFilePath = useEditor((s) => s.activeFilePath)
  const openFile = useEditor((s) => s.openFile)
  const closeFile = useEditor((s) => s.closeFile)
  const setActive = useEditor((s) => s.setActive)
  const updateActiveBuffer = useEditor((s) => s.updateActiveBuffer)
  const saveActive = useEditor((s) => s.saveActive)

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  )

  const root = activeSession?.worktreePath ?? activeSession?.cwd ?? null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveActive()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, saveActive])

  if (!open) return null

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/85 p-6 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="df-fade-in flex h-[90vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-lg border border-border-mid bg-bg-2 shadow-pop">
        <header className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Code2 size={16} strokeWidth={1.75} className="text-text-2" />
            <div className="text-sm font-semibold text-text-1">Editor</div>
            {root && (
              <div className="truncate font-mono text-xs text-text-4" title={root}>
                {root}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void saveActive()}
              disabled={!activeFile || activeFile.encoding !== 'utf-8'}
              className="flex items-center gap-1.5 rounded-md border border-border-soft bg-bg-3 px-2.5 py-1 text-xs text-text-2 hover:bg-bg-4 disabled:cursor-not-allowed disabled:opacity-40"
              title="Save (Cmd/Ctrl+S)"
            >
              <Save size={13} strokeWidth={1.75} />
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
              aria-label="Close editor"
              title="Esc"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <aside className="df-scroll w-64 shrink-0 overflow-y-auto border-r border-border-soft bg-bg-2">
            {root ? (
              <FileTree root={root} onOpenFile={(p) => void openFile(p)} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <FileIcon size={28} strokeWidth={1.25} className="text-text-4" />
                <div className="text-xs text-text-2">No active session</div>
                <div className="text-[11px] text-text-4">
                  Open a session to browse its files.
                </div>
              </div>
            )}
          </aside>
          <section className="flex flex-1 flex-col overflow-hidden bg-bg-1">
            <div className="df-scroll flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border-soft bg-bg-2 px-2 pt-2">
              {openFiles.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-4">No file open</div>
              )}
              {openFiles.map((f) => {
                const name = f.path.split('/').pop() ?? f.path
                const active = f.path === activeFilePath
                return (
                  <div
                    key={f.path}
                    className={`group flex items-center gap-2 rounded-t-md px-3 py-1.5 text-xs ${
                      active
                        ? 'border-t-2 border-accent-500 bg-bg-1 text-text-1'
                        : 'border-t-2 border-transparent bg-bg-3 text-text-3 hover:bg-bg-4 hover:text-text-2'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActive(f.path)}
                      className="max-w-[14rem] truncate text-left"
                      title={f.path}
                    >
                      {name}
                    </button>
                    <button
                      type="button"
                      onClick={() => closeFile(f.path)}
                      className={`rounded p-0.5 text-text-4 hover:bg-bg-4 hover:text-text-1 ${
                        active ? '' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      aria-label="Close tab"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex-1 overflow-hidden bg-bg-1 p-3.5">
              {activeFile && activeFile.encoding === 'utf-8' ? (
                <CodeMirrorView
                  key={activeFile.path}
                  path={activeFile.path}
                  initial={activeFile.bytes}
                  onChange={(text) => updateActiveBuffer(text)}
                  onSave={() => void saveActive()}
                />
              ) : activeFile ? (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <FileIcon size={32} strokeWidth={1.25} className="text-text-4" />
                  <div className="text-sm text-text-2">Binary file</div>
                  <div className="text-xs text-text-4">
                    {activeFile.size.toLocaleString()} bytes — cannot be displayed
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <FileIcon size={32} strokeWidth={1.25} className="text-text-4" />
                  <div className="text-sm text-text-2">No file selected</div>
                  <div className="text-xs text-text-4">
                    Pick a file from the tree to start editing.
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
