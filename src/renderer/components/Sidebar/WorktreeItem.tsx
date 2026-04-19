import { useState } from 'react'
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
    { label: hasSession ? 'Switch to session' : 'Open session', onSelect: onOpenSession },
    { label: 'Copy path', onSelect: onCopyPath },
    {
      label: 'Remove worktree',
      onSelect: onRemove,
      danger: true,
      disabled: worktree.isMain || worktree.isBare
    }
  ]

  return (
    <>
      <div
        className="group flex items-center gap-1.5 rounded px-2 py-1 pl-5 text-xs text-white/70 transition hover:bg-white/5 hover:text-white/90"
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        title={worktree.path}
      >
        <span className="text-white/30" aria-hidden>
          {worktree.isMain ? '●' : '◦'}
        </span>
        <button type="button" onClick={onOpenSession} className="flex-1 truncate text-left">
          <span className="text-white/85">{branch}</span>
          {worktree.isMain && <span className="ml-1 text-[10px] text-white/40">main</span>}
        </button>
        <button
          type="button"
          onClick={onOpenSession}
          className="text-white/30 opacity-0 transition group-hover:opacity-100 hover:text-emerald-300"
          title="open session"
          aria-label="open session"
        >
          ⏎
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onDismiss={() => setMenu(null)} />}
    </>
  )
}
