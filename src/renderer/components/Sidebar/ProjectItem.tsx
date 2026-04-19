import { useState } from 'react'
import type { ProjectMeta } from '../../../shared/types'
import ContextMenu, { type ContextMenuItem } from '../ContextMenu'

interface ProjectItemProps {
  project: ProjectMeta
  active: boolean
  expanded: boolean
  onSelect: () => void
  onToggleExpand: () => void
  onRemove: () => void
  onCopyPath: () => void
}

export default function ProjectItem({
  project,
  active,
  expanded,
  onSelect,
  onToggleExpand,
  onRemove,
  onCopyPath
}: ProjectItemProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const items: ContextMenuItem[] = [
    { label: 'Switch to project', onSelect },
    { label: 'Copy path', onSelect: onCopyPath },
    { label: 'Remove from list', onSelect: onRemove, danger: true }
  ]

  return (
    <>
      <div
        className={`group flex items-center gap-1 rounded px-2 py-1 text-xs transition ${
          active
            ? 'bg-white/10 text-white'
            : 'text-white/70 hover:bg-white/5 hover:text-white/90'
        }`}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-white/40 hover:text-white/80"
          aria-label={expanded ? 'collapse project' : 'expand project'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 truncate text-left"
          title={project.path}
        >
          <span className={active ? 'font-medium' : ''}>{project.name}</span>
        </button>
        {active && <span className="text-[10px] text-emerald-400">active</span>}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onDismiss={() => setMenu(null)} />}
    </>
  )
}
