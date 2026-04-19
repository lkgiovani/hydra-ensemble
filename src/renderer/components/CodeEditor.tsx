import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c]/95 backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-white/10 bg-[#16161a] px-4 py-2 text-xs text-white/60">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold tracking-wider text-white/80">
            EDITOR
          </span>
          {root && <span className="truncate text-white/40">{root}</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
        >
          close (esc)
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-[#101014]">
          {root ? (
            <FileTree root={root} onOpenFile={(p) => void openFile(p)} />
          ) : (
            <div className="p-3 text-xs text-white/40">no active session</div>
          )}
        </aside>
        <section className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#16161a] px-2 py-1">
            {openFiles.length === 0 && (
              <div className="px-2 text-[11px] text-white/40">no file open</div>
            )}
            {openFiles.map((f) => {
              const name = f.path.split('/').pop() ?? f.path
              const active = f.path === activeFilePath
              return (
                <div
                  key={f.path}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
                    active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActive(f.path)}
                    className="truncate"
                    title={f.path}
                  >
                    {name}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeFile(f.path)}
                    className="text-white/40 hover:text-white"
                    aria-label="close tab"
                  >
                    x
                  </button>
                </div>
              )
            })}
          </div>
          <div className="flex-1 overflow-hidden bg-[#0d0d0f]">
            {activeFile && activeFile.encoding === 'utf-8' ? (
              <CodeMirrorView
                key={activeFile.path}
                path={activeFile.path}
                initial={activeFile.bytes}
                onChange={(text) => updateActiveBuffer(text)}
                onSave={() => void saveActive()}
              />
            ) : activeFile ? (
              <div className="flex h-full items-center justify-center text-xs text-white/40">
                binary file (size {activeFile.size} bytes) cannot be displayed
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/40">
                pick a file from the tree
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
