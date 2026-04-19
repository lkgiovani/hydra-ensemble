import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  ArrowRightLeft,
  Copy,
  Trash2
} from 'lucide-react'
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
    {
      label: 'Switch to project',
      onSelect,
      icon: <ArrowRightLeft size={14} strokeWidth={1.75} />
    },
    {
      label: 'Copy path',
      onSelect: onCopyPath,
      icon: <Copy size={14} strokeWidth={1.75} />
    },
    {
      label: 'Remove from list',
      onSelect: onRemove,
      danger: true,
      icon: <Trash2 size={14} strokeWidth={1.75} />
    }
  ]

  const Chevron = expanded ? ChevronDown : ChevronRight
  const FolderIcon = expanded || active ? FolderOpen : Folder

  const rowTone = active
    ? 'bg-bg-4 text-text-1'
    : 'text-text-2 hover:bg-bg-3 hover:text-text-1'

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm transition-colors ${rowTone}`}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-4 hover:bg-bg-4 hover:text-text-2"
          aria-label={expanded ? 'collapse project' : 'expand project'}
        >
          <Chevron size={14} strokeWidth={1.75} />
        </button>
        <FolderIcon
          size={14}
          strokeWidth={1.75}
          className={active ? 'text-accent-400' : 'text-text-3'}
          aria-hidden
        />
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 truncate text-left"
          title={project.path}
        >
          <span className={active ? 'font-medium' : ''}>{project.name}</span>
        </button>
        {active && (
          <span
            className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400"
            aria-label="active"
            title="active"
          />
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onDismiss={() => setMenu(null)} />}
    </>
  )
}
