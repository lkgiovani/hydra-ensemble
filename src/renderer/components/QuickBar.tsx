import { useEffect, useMemo, useRef } from 'react'
import {
  Search,
  Plus,
  Terminal,
  Code2,
  HelpCircle,
  PlayCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useSessions } from '../state/sessions'
import { useProjects } from '../state/projects'
import { useSlidePanel, useTerminalsPanel, type PanelKind } from '../state/panels'
import { useSpawnDialog } from '../state/spawn'
import { useTours } from '../tour/state'
import { fmtShortcut, hasMod } from '../lib/platform'

/**
 * Map the currently-open slide panel (or its absence) to the tour id that
 * covers that surface. Keeps the Tour button contextual — clicking it while
 * the editor is open launches the editor walkthrough rather than the
 * generic dashboard one.
 */
const SURFACE_TOUR_BY_PANEL: Record<PanelKind, string> = {
  dashboard: 'classic-overview',
  editor: 'workspace-editor',
  watchdogs: 'classic-overview',
  pr: 'classic-overview',
  terminals: 'classic-overview'
}

const DEFAULT_SURFACE_TOUR = 'classic-overview'

function resolveSurfaceTourId(panel: PanelKind | null): string {
  if (!panel) return DEFAULT_SURFACE_TOUR
  return SURFACE_TOUR_BY_PANEL[panel] ?? DEFAULT_SURFACE_TOUR
}

interface ActionButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  pulse?: boolean
  testId?: string
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  pulse = false,
  testId
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={[
        'relative flex h-7 w-7 items-center justify-center rounded-md text-text-3',
        'transition-colors hover:bg-bg-3 hover:text-text-1',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-border-mid'
      ].join(' ')}
    >
      <Icon size={14} strokeWidth={1.75} />
      {pulse ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 inline-flex h-1.5 w-1.5"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-attention opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-status-attention" />
        </span>
      ) : null}
    </button>
  )
}

/**
 * QuickBar — a 36px strip that lives at the top of the Classic Dashboard
 * and replaces the old keybind-hint row with a discoverable command surface.
 *
 * Left     : breadcrumb (Project · Worktree · Session name)
 * Middle   : "Search anything" input that opens the CommandPalette
 * Right    : quick-action icons (New session, Editor, Terminals, Help, Tour)
 *
 * The search input is a *decoy* — clicking or focusing it dispatches
 * `orchestra:search-toggle`, which is the same event CommandPalette already
 * listens to. This avoids duplicating palette state in two components while
 * still giving the user an obvious "type here" affordance.
 */
interface Props {}

export default function QuickBar(_: Props) {
  const activeSession = useSessions((s) =>
    s.activeId ? (s.sessions.find((x) => x.id === s.activeId) ?? null) : null
  )
  const currentProjectPath = useProjects((s) => s.currentPath)
  const projects = useProjects((s) => s.projects)
  const worktrees = useProjects((s) => s.worktrees)

  const showSpawn = useSpawnDialog((s) => s.show)
  const toggleSlidePanel = useSlidePanel((s) => s.toggle)
  const currentPanel = useSlidePanel((s) => s.current)
  const toggleTerminals = useTerminalsPanel((s) => s.toggle)

  const completedTours = useTours((s) => s.completedTours)

  const searchRef = useRef<HTMLInputElement>(null)

  const projectName = useMemo(() => {
    if (!currentProjectPath) return 'No project'
    const meta = projects.find((p) => p.path === currentProjectPath)
    if (meta?.name) return meta.name
    // Fall back to the last path segment so the breadcrumb is never empty
    // while the projects list is still loading.
    const segs = currentProjectPath.split('/').filter(Boolean)
    return segs[segs.length - 1] ?? currentProjectPath
  }, [currentProjectPath, projects])

  const worktreeLabel = useMemo(() => {
    const path = activeSession?.worktreePath
    if (!path) return null
    const match = worktrees.find((w) => w.path === path)
    if (match?.branch) return match.branch
    const segs = path.split('/').filter(Boolean)
    return segs[segs.length - 1] ?? null
  }, [activeSession?.worktreePath, worktrees])

  const surfaceTourId = useMemo(
    () => resolveSurfaceTourId(currentPanel),
    [currentPanel]
  )
  const tourPulse = !completedTours[surfaceTourId]

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent('orchestra:search-toggle'))
  }

  // Global Cmd/Ctrl+K also opens the palette. CommandPalette already wires
  // its own shortcut in useOrchestraKeybinds, but registering here too keeps
  // the QuickBar self-contained so it still works if a caller embeds it on
  // a surface where the orchestra keybind layer isn't mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hasMod(e)) return
      if (e.key !== 'k' && e.key !== 'K') return
      e.preventDefault()
      openPalette()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSearchActivate = () => {
    // Briefly focus so the keyboard ring flashes, then hand off to the
    // palette. Blur on next tick so the palette's own input can grab focus
    // without fighting us for it.
    searchRef.current?.focus()
    window.setTimeout(() => {
      searchRef.current?.blur()
      openPalette()
    }, 0)
  }

  const handleTour = () => {
    window.dispatchEvent(
      new CustomEvent('app:open-tour', { detail: { id: surfaceTourId } })
    )
  }

  const searchPlaceholder = `Search sessions, commands, files… (${fmtShortcut('K')})`

  return (
    <div
      role="toolbar"
      aria-label="Quick bar"
      className="flex h-9 shrink-0 items-center gap-3 border-b border-border-soft bg-bg-2 px-3"
    >
      {/* Breadcrumb */}
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-3">
        <span className="truncate font-medium text-text-2" title={projectName}>
          {projectName}
        </span>
        {worktreeLabel ? (
          <>
            <span aria-hidden className="text-text-4">
              ·
            </span>
            <span
              className="truncate font-mono text-text-3"
              title={worktreeLabel}
            >
              {worktreeLabel}
            </span>
          </>
        ) : null}
        {activeSession ? (
          <>
            <span aria-hidden className="text-text-4">
              ·
            </span>
            <span className="truncate text-text-2" title={activeSession.name}>
              {activeSession.name}
            </span>
          </>
        ) : null}
      </div>

      {/* Search decoy — centered, consistent width */}
      <div className="mx-auto flex items-center">
        <button
          type="button"
          onClick={handleSearchActivate}
          className="group relative flex w-[320px] items-center gap-2 rounded-full border border-border-soft bg-bg-1 px-3 py-1.5 text-left text-[12px] text-text-3 transition-colors hover:border-border-mid hover:bg-bg-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-border-mid"
          aria-label="Open command palette"
        >
          <Search
            size={12}
            strokeWidth={1.75}
            className="shrink-0 text-text-4"
          />
          <input
            ref={searchRef}
            readOnly
            tabIndex={-1}
            aria-hidden
            value=""
            placeholder={searchPlaceholder}
            onFocus={handleSearchActivate}
            onClick={(e) => {
              e.stopPropagation()
              handleSearchActivate()
            }}
            className="pointer-events-none flex-1 truncate bg-transparent text-[12px] text-text-3 placeholder:text-text-4 focus:outline-none"
          />
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex shrink-0 items-center gap-1">
        <ActionButton
          icon={Plus}
          label="New session"
          onClick={showSpawn}
          testId="quickbar-new-session"
        />
        <ActionButton
          icon={Code2}
          label="Editor"
          onClick={() => toggleSlidePanel('editor')}
          testId="quickbar-editor"
        />
        <ActionButton
          icon={Terminal}
          label="Terminals"
          onClick={toggleTerminals}
          testId="quickbar-terminals"
        />
        <ActionButton
          icon={HelpCircle}
          label="Help"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('app:open-help'))
          }}
          testId="quickbar-help"
        />
        <ActionButton
          icon={PlayCircle}
          label="Tour"
          onClick={handleTour}
          pulse={tourPulse}
          testId="quickbar-tour"
        />
      </div>
    </div>
  )
}
