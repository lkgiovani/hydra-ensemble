import { useState } from 'react'
import { GitBranch, CornerDownRight, Copy, Trash2, Terminal } from 'lucide-react'
import type { Worktree } from '../../../shared/types'
import ContextMenu, { type ContextMenuItem } from '../ContextMenu'

interface WorktreeItemProps {
  worktree: Worktree
  hasSession: boolean
  onOpenSession: () => void
  onRemove: () => void
  onCopyPath: () => void
}

export default function WorktreeItem({
  worktree,
  hasSession,
  onOpenSession,
  onRemove,
  onCopyPath
}: WorktreeItemProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const branch = worktree.branch || 'detached'
  const items: ContextMenuItem[] = [
    {
      label: hasSession ? 'Switch to session' : 'Open session',
      onSelect: onOpenSession,
      icon: <Terminal size={14} strokeWidth={1.75} />
    },
    {
      label: 'Copy path',
      onSelect: onCopyPath,
      icon: <Copy size={14} strokeWidth={1.75} />
    },
    {
      label: 'Remove worktree',
      onSelect: onRemove,
      danger: true,
      disabled: worktree.isMain || worktree.isBare,
      icon: <Trash2 size={14} strokeWidth={1.75} />
    }
  ]

  return (
    <>
      <div
        className="group flex items-center gap-1.5 rounded-sm py-1 pl-6 pr-2 text-xs text-text-2 transition-colors hover:bg-bg-3 hover:text-text-1"
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        title={worktree.path}
      >
        <GitBranch
          size={12}
          strokeWidth={1.75}
          className={
            worktree.isMain
              ? 'shrink-0 text-accent-400'
              : 'shrink-0 text-text-4'
          }
          aria-hidden
        />
        <button
          type="button"
          onClick={onOpenSession}
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
        >
          <span className="truncate font-mono text-text-1">{branch}</span>
          {worktree.isMain && (
            <span className="shrink-0 rounded-sm bg-bg-3 px-1 text-[9px] font-medium uppercase tracking-wider text-text-4">
              main
            </span>
          )}
          {hasSession && (
            <span
              className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-generating"
              title="session open"
              aria-label="session open"
            />
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSession}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-4 opacity-0 transition hover:bg-bg-4 hover:text-accent-400 group-hover:opacity-100"
          title={hasSession ? 'switch to session' : 'open session'}
          aria-label={hasSession ? 'switch to session' : 'open session'}
        >
          <CornerDownRight size={12} strokeWidth={1.75} />
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onDismiss={() => setMenu(null)} />}
    </>
  )
}
