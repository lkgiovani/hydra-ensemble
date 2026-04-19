import { useEffect, useMemo, useState } from 'react'
import { useProjects } from '../../state/projects'
import { useSessions } from '../../state/sessions'
import ProjectItem from './ProjectItem'
import WorktreeItem from './WorktreeItem'
import CreateWorktreeDialog from './CreateWorktreeDialog'

export default function Sidebar() {
  const projects = useProjects((s) => s.projects)
  const currentPath = useProjects((s) => s.currentPath)
  const worktrees = useProjects((s) => s.worktrees)
  const loadingWorktrees = useProjects((s) => s.loadingWorktrees)
  const error = useProjects((s) => s.error)
  const init = useProjects((s) => s.init)
  const addProject = useProjects((s) => s.addProject)
  const removeProject = useProjects((s) => s.removeProject)
  const setCurrent = useProjects((s) => s.setCurrent)
  const createWorktree = useProjects((s) => s.createWorktree)
  const removeWorktree = useProjects((s) => s.removeWorktree)

  const sessions = useSessions((s) => s.sessions)
  const setActiveSession = useSessions((s) => s.setActive)
  const createSession = useSessions((s) => s.createSession)

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [worktreesOpen, setWorktreesOpen] = useState(true)
  const [sessionsOpen, setSessionsOpen] = useState(true)

  useEffect(() => {
    void init()
  }, [init])

  // Auto-expand the active project so its worktrees are visible by default.
  useEffect(() => {
    if (currentPath) {
      setExpandedProjects((prev) => {
        if (prev.has(currentPath)) return prev
        const next = new Set(prev)
        next.add(currentPath)
        return next
      })
    }
  }, [currentPath])

  const projectSessions = useMemo(() => {
    if (!currentPath) return []
    return sessions.filter(
      (s) => s.cwd === currentPath || s.worktreePath?.startsWith(currentPath)
    )
  }, [sessions, currentPath])

  const currentProject = projects.find((p) => p.path === currentPath) ?? null

  const copyToClipboard = (value: string): void => {
    void navigator.clipboard?.writeText(value).catch(() => undefined)
  }

  const openSessionForWorktree = async (path: string, branch: string): Promise<void> => {
    const existing = sessions.find((s) => s.worktreePath === path || s.cwd === path)
    if (existing) {
      setActiveSession(existing.id)
      return
    }
    await createSession({ cwd: path, worktreePath: path, branch, name: branch || undefined })
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/10 bg-[#0f0f12] text-white/80">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-medium tracking-wider text-white/40">PROJECT</div>
          <div className="truncate text-sm font-medium text-white" title={currentProject?.path}>
            {currentProject?.name ?? 'no project'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void addProject()}
          className="rounded bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          title="open project"
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-1 py-2">
        {projects.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <div className="mb-3 text-xs text-white/40">no projects yet</div>
            <button
              type="button"
              onClick={() => void addProject()}
              className="rounded bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30"
            >
              + open project
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 px-2 text-[10px] font-medium tracking-wider text-white/40">
              PROJECTS
            </div>
            <div className="mb-3 flex flex-col gap-0.5">
              {projects.map((p) => {
                const expanded = expandedProjects.has(p.path)
                const active = p.path === currentPath
                return (
                  <div key={p.path}>
                    <ProjectItem
                      project={p}
                      active={active}
                      expanded={expanded}
                      onSelect={() => void setCurrent(p.path)}
                      onToggleExpand={() =>
                        setExpandedProjects((prev) => {
                          const next = new Set(prev)
                          if (next.has(p.path)) next.delete(p.path)
                          else next.add(p.path)
                          return next
                        })
                      }
                      onRemove={() => void removeProject(p.path)}
                      onCopyPath={() => copyToClipboard(p.path)}
                    />
                  </div>
                )
              })}
            </div>

            {currentPath && (
              <>
                <div className="mb-1 flex items-center justify-between px-2">
                  <button
                    type="button"
                    onClick={() => setWorktreesOpen((v) => !v)}
                    className="flex items-center gap-1 text-[10px] font-medium tracking-wider text-white/40 hover:text-white/70"
                  >
                    <span>{worktreesOpen ? '▾' : '▸'}</span>
                    <span>WORKTREES</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate((v) => !v)}
                    className="rounded px-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white"
                    title="new worktree"
                  >
                    +
                  </button>
                </div>
                {worktreesOpen && (
                  <div className="mb-3 flex flex-col gap-0.5">
                    {showCreate && (
                      <CreateWorktreeDialog
                        onSubmit={async (name, base) => {
                          await createWorktree(name, base)
                          setShowCreate(false)
                        }}
                        onCancel={() => setShowCreate(false)}
                      />
                    )}
                    {loadingWorktrees && worktrees.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-white/30">loading…</div>
                    ) : worktrees.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-white/30">no worktrees</div>
                    ) : (
                      worktrees.map((wt) => (
                        <WorktreeItem
                          key={wt.path}
                          worktree={wt}
                          hasSession={sessions.some(
                            (s) => s.worktreePath === wt.path || s.cwd === wt.path
                          )}
                          onOpenSession={() =>
                            void openSessionForWorktree(wt.path, wt.branch)
                          }
                          onRemove={() => void removeWorktree(wt.path)}
                          onCopyPath={() => copyToClipboard(wt.path)}
                        />
                      ))
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setSessionsOpen((v) => !v)}
                  className="mb-1 flex items-center gap-1 px-2 text-[10px] font-medium tracking-wider text-white/40 hover:text-white/70"
                >
                  <span>{sessionsOpen ? '▾' : '▸'}</span>
                  <span>SESSIONS</span>
                </button>
                {sessionsOpen && (
                  <div className="flex flex-col gap-0.5">
                    {projectSessions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-white/30">no sessions</div>
                    ) : (
                      projectSessions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setActiveSession(s.id)}
                          className="flex items-center gap-1.5 rounded px-2 py-1 pl-5 text-left text-xs text-white/70 hover:bg-white/5 hover:text-white/90"
                          title={s.worktreePath ?? s.cwd}
                        >
                          <span className="text-white/30">⌁</span>
                          <span className="flex-1 truncate">{s.name}</span>
                          {s.branch && (
                            <span className="text-[10px] text-white/40">{s.branch}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <footer className="border-t border-white/10 px-3 py-2 text-[10px] text-red-400/80">
          ipc unavailable: {error}
        </footer>
      )}
    </aside>
  )
}
