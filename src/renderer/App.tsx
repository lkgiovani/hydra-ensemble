import { useEffect, useMemo, useState } from 'react'
import {
  Code2,
  FolderTree,
  GitPullRequest,
  LayoutDashboard,
  Wand2
} from 'lucide-react'
import SessionPane from './components/SessionPane'
import StatusBar from './components/StatusBar'
import Dashboard from './components/Dashboard'
import Sidebar from './components/Sidebar'
import CodeEditor from './components/CodeEditor'
import PRInspector from './components/PRInspector'
import VoiceButton from './components/VoiceButton'
import SessionsPanel from './components/SessionsPanel'
import ToolkitGrid from './components/ToolkitGrid'
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
  const [drawerOpen, setDrawerOpen] = useState(false)

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

  const contextCwd =
    activeSession?.worktreePath ?? activeSession?.cwd ?? currentProject?.path ?? null

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

      if (key === 'd' && !e.shiftKey) {
        e.preventDefault()
        toggleDashboard()
        return
      }
      if (key === 'e' && !e.shiftKey) {
        e.preventDefault()
        toggleEditor()
        return
      }
      if (key === 'b' && !e.shiftKey) {
        e.preventDefault()
        setDrawerOpen((v) => !v)
        return
      }
      if (key === 't' && !e.shiftKey) {
        e.preventDefault()
        void createSession({ cwd: contextCwd ?? undefined })
        return
      }
      if (key === 'w' && !e.shiftKey) {
        if (!activeId) return
        e.preventDefault()
        void destroySession(activeId)
        return
      }
      if (/^[0-9]$/.test(e.key) && !e.shiftKey) {
        const idx = e.key === '0' ? 9 : Number.parseInt(e.key, 10) - 1
        const target = sessions[idx]
        if (!target) return
        e.preventDefault()
        setActive(target.id)
        return
      }
      if (e.key === '[' && !e.shiftKey) {
        if (!activeId) return
        e.preventDefault()
        const i = sessions.findIndex((s) => s.id === activeId)
        const prev = sessions[(i - 1 + sessions.length) % sessions.length]
        if (prev) setActive(prev.id)
        return
      }
      if (e.key === ']' && !e.shiftKey) {
        if (!activeId) return
        e.preventDefault()
        const i = sessions.findIndex((s) => s.id === activeId)
        const next = sessions[(i + 1) % sessions.length]
        if (next) setActive(next.id)
        return
      }
      if (e.key === '`' && !e.shiftKey) {
        e.preventDefault()
        void window.api.quickTerm.toggle()
        return
      }
      if (key === 'p' && e.shiftKey) {
        if (!contextCwd) return
        e.preventDefault()
        if (ghOpen) closeGh()
        else openGh(contextCwd)
        return
      }
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
    <div className="flex h-screen w-screen overflow-hidden bg-bg-0 text-text-1">
      {/* Project drawer (collapsible) */}
      <div
        className={`shrink-0 overflow-hidden border-r border-border-soft transition-[width] duration-200 ${
          drawerOpen ? 'w-64' : 'w-0'
        }`}
      >
        <Sidebar />
      </div>

      {/* Main column: header, terminal, status bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-border-soft bg-bg-2 px-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent-400 df-pulse" />
              <span className="font-sans text-sm font-semibold tracking-tight text-text-1">
                Hydra Ensemble
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
                drawerOpen
                  ? 'bg-bg-4 text-text-1'
                  : 'text-text-3 hover:bg-bg-3 hover:text-text-1'
              }`}
              title="toggle projects (Cmd/Ctrl+B)"
            >
              <FolderTree size={13} strokeWidth={1.75} />
              <span>{currentProject?.name ?? 'Projects'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <HeaderButton
              icon={<GitPullRequest size={13} strokeWidth={1.75} />}
              label="PRs"
              shortcut="⌘⇧P"
              onClick={() => contextCwd && openGh(contextCwd)}
              disabled={!contextCwd}
            />
            <HeaderButton
              icon={<Wand2 size={13} strokeWidth={1.75} />}
              label="Watchdogs"
              shortcut="⌘⇧W"
              onClick={togglePanel}
            />
            <HeaderButton
              icon={<Code2 size={13} strokeWidth={1.75} />}
              label="Editor"
              shortcut="⌘E"
              onClick={toggleEditor}
            />
            <HeaderButton
              icon={<LayoutDashboard size={13} strokeWidth={1.75} />}
              label="Dashboard"
              shortcut="⌘D"
              onClick={toggleDashboard}
            />
            <div className="ml-2 flex items-center gap-2 border-l border-border-soft pl-3 font-mono text-[11px] text-text-3">
              <span>{window.api.platform.os}</span>
              <span>·</span>
              <span
                className={
                  claudePath === undefined
                    ? 'text-text-4'
                    : claudePath === null
                      ? 'text-status-attention'
                      : 'text-status-generating'
                }
              >
                {claudePath === undefined
                  ? 'resolving…'
                  : claudePath === null
                    ? 'no claude'
                    : 'claude'}
              </span>
            </div>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1">
          {/* Terminal area */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-bg-1">
            {sessions.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center">
                <div className="max-w-md">
                  <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-bg-3 text-accent-400">
                    <span className="text-xl">●</span>
                  </div>
                  <div className="mb-1 text-base font-semibold text-text-1">
                    no Claude sessions running
                  </div>
                  <div className="mb-4 text-sm text-text-3">
                    spawn a session in the right panel — each runs in an isolated
                    <span className="ml-1 rounded bg-bg-3 px-1.5 py-0.5 font-mono text-[11px]">
                      CLAUDE_CONFIG_DIR
                    </span>{' '}
                    so they never collide.
                  </div>
                  <button
                    type="button"
                    onClick={() => createSession({ cwd: contextCwd ?? undefined })}
                    className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600"
                  >
                    Spawn first session
                    <span className="font-mono text-[10px] opacity-70">⌘T</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative min-h-0 flex-1 overflow-hidden">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="absolute inset-0"
                    style={{ display: s.id === activeId ? 'block' : 'none' }}
                  >
                    <SessionPane session={s} visible={s.id === activeId} />
                  </div>
                ))}
              </div>
            )}
            {activeSession ? <VoiceButton /> : null}
          </div>

          {/* Right panel: sessions on top, toolkit below */}
          <div className="flex w-80 shrink-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <SessionsPanel />
            </div>
            <div className="h-[42%] min-h-[220px] overflow-hidden">
              <ToolkitGrid
                cwd={contextCwd}
                projectName={currentProject?.name}
                branch={activeSession?.branch}
              />
            </div>
          </div>
        </main>

        <StatusBar />
      </div>

      {/* Overlays */}
      <Dashboard open={dashboardOpen} onClose={closeDashboard} />
      <CodeEditor open={editorOpen} onClose={closeEditor} />
      <PRInspector cwd={contextCwd} open={ghOpen} onClose={closeGh} />
      <WatchdogPanel />
      <ToolkitEditorDialog />
    </div>
  )
}

interface HeaderButtonProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
}

function HeaderButton({ icon, label, shortcut, onClick, disabled }: HeaderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-3 transition hover:bg-bg-3 hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-3"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
