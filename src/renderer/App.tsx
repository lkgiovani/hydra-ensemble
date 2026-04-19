import { useEffect, useMemo, useState } from 'react'
import SessionTabs from './components/SessionTabs'
import SessionPane from './components/SessionPane'
import StatusBar from './components/StatusBar'
import Dashboard from './components/Dashboard'
import Sidebar from './components/Sidebar'
import CodeEditor from './components/CodeEditor'
import PRInspector from './components/PRInspector'
import VoiceButton from './components/VoiceButton'
import ToolkitBar from './components/Toolkit/Bar'
import ToolkitEditorDialog from './components/Toolkit/EditorDialog'
import WatchdogPanel from './components/Watchdog/Panel'
import { useSessions } from './state/sessions'
import { useSessionsUi } from './state/sessionsExtra'
import { useEditor } from './state/editor'
import { useProjects } from './state/projects'
import { useGh } from './state/gh'
import { useToolkit } from './state/toolkit'
import { useWatchdog } from './state/watchdog'

export default function App() {
  const [claudePath, setClaudePath] = useState<string | null | undefined>(undefined)

  const sessions = useSessions((s) => s.sessions)
  const activeId = useSessions((s) => s.activeId)
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  )
  const initSessions = useSessions((s) => s.init)
  const createSession = useSessions((s) => s.createSession)
  const destroySession = useSessions((s) => s.destroySession)
  const setActive = useSessions((s) => s.setActive)

  const dashboardOpen = useSessionsUi((s) => s.dashboardOpen)
  const closeDashboard = useSessionsUi((s) => s.closeDashboard)
  const toggleDashboard = useSessionsUi((s) => s.toggleDashboard)

  const editorOpen = useEditor((s) => s.editorOpen)
  const closeEditor = useEditor((s) => s.closeEditor)
  const toggleEditor = useEditor((s) => s.toggleEditor)

  const initToolkit = useToolkit((s) => s.init)
  const initWatchdog = useWatchdog((s) => s.init)
  const togglePanel = useWatchdog((s) => s.togglePanel)
  const initProjects = useProjects((s) => s.init)
  const currentProject = useProjects((s) => s.projects.find((p) => p.path === s.currentPath))

  const ghOpen = useGh((s) => s.open)
  const openGh = useGh((s) => s.openPanel)
  const closeGh = useGh((s) => s.closePanel)

  // Active "context cwd" for actions like PR inspector / toolkit:
  // prefer the active session, otherwise the current project, otherwise none.
  const contextCwd = activeSession?.worktreePath ?? activeSession?.cwd ?? currentProject?.path ?? null

  useEffect(() => {
    void initSessions()
    void initToolkit()
    void initWatchdog()
    void initProjects()
    void window.api.claude.resolvePath().then(setClaudePath)
  }, [initSessions, initToolkit, initWatchdog, initProjects])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()

      // Cmd/Ctrl + D: dashboard
      if (key === 'd' && !e.shiftKey) {
        e.preventDefault()
        toggleDashboard()
        return
      }
      // Cmd/Ctrl + E: code editor
      if (key === 'e' && !e.shiftKey) {
        e.preventDefault()
        toggleEditor()
        return
      }
      // Cmd/Ctrl + T: new session
      if (key === 't' && !e.shiftKey) {
        e.preventDefault()
        void createSession({ cwd: contextCwd ?? undefined })
        return
      }
      // Cmd/Ctrl + W: close active session
      if (key === 'w' && !e.shiftKey) {
        if (!activeId) return
        e.preventDefault()
        void destroySession(activeId)
        return
      }
      // Cmd/Ctrl + 1..9: switch session
      if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
        const idx = Number.parseInt(e.key, 10) - 1
        const target = sessions[idx]
        if (!target) return
        e.preventDefault()
        setActive(target.id)
        return
      }
      // Cmd/Ctrl + `: toggle quick terminal
      if (e.key === '`' && !e.shiftKey) {
        e.preventDefault()
        void window.api.quickTerm.toggle()
        return
      }
      // Cmd/Ctrl + Shift + P: toggle PR inspector
      if (key === 'p' && e.shiftKey) {
        if (!contextCwd) return
        e.preventDefault()
        if (ghOpen) closeGh()
        else openGh(contextCwd)
        return
      }
      // Cmd/Ctrl + Shift + W: toggle watchdog panel
      if (key === 'w' && e.shiftKey) {
        e.preventDefault()
        togglePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    toggleDashboard,
    toggleEditor,
    createSession,
    destroySession,
    activeId,
    sessions,
    setActive,
    ghOpen,
    openGh,
    closeGh,
    togglePanel,
    contextCwd
  ])

  return (
    <div className="flex h-screen w-screen bg-[#0d0d0f] text-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#16161a] px-4 py-2 text-xs text-white/60">
          <div className="flex items-center gap-3">
            <div className="font-medium text-white/80">Hydra Ensemble</div>
            <ToolkitBar />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => contextCwd && openGh(contextCwd)}
              disabled={!contextCwd}
              className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/5 hover:text-white/90 disabled:opacity-40"
              title="PR inspector (Cmd/Ctrl+Shift+P)"
            >
              PRs
            </button>
            <button
              type="button"
              onClick={() => togglePanel()}
              className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/5 hover:text-white/90"
              title="Watchdogs (Cmd/Ctrl+Shift+W)"
            >
              watchdogs
            </button>
            <button
              type="button"
              onClick={() => toggleEditor()}
              className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/5 hover:text-white/90"
              title="Code editor (Cmd/Ctrl+E)"
            >
              editor
            </button>
            <button
              type="button"
              onClick={() => toggleDashboard()}
              className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/5 hover:text-white/90"
              title="Dashboard (Cmd/Ctrl+D)"
            >
              dashboard
            </button>
            <span>os: {window.api.platform.os}</span>
            <span>
              claude:{' '}
              {claudePath === undefined ? (
                <span className="text-white/40">resolving…</span>
              ) : claudePath === null ? (
                <span className="text-yellow-400">not found in PATH</span>
              ) : (
                <span className="text-emerald-400">{claudePath}</span>
              )}
            </span>
          </div>
        </header>
        <SessionTabs />
        <main className="relative flex-1 overflow-hidden">
          {sessions.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              click <span className="mx-1 rounded bg-white/10 px-2 py-0.5">+ new claude session</span> to start
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="absolute inset-0"
                style={{ display: s.id === activeId ? 'block' : 'none' }}
              >
                <SessionPane session={s} visible={s.id === activeId} />
              </div>
            ))
          )}
          {activeSession ? <VoiceButton /> : null}
        </main>
        <StatusBar />
      </div>

      <Dashboard open={dashboardOpen} onClose={closeDashboard} />
      <CodeEditor open={editorOpen} onClose={closeEditor} />
      <PRInspector cwd={contextCwd} open={ghOpen} onClose={closeGh} />
      <WatchdogPanel />
      <ToolkitEditorDialog />
    </div>
  )
}
