import { useEffect, useState } from 'react'
import type { DirEntry } from '../../../shared/types'

interface Props {
  root: string
  onOpenFile: (path: string) => void
}

interface NodeProps {
  entry: DirEntry
  depth: number
  onOpenFile: (path: string) => void
}

function indent(depth: number): React.CSSProperties {
  return { paddingLeft: `${8 + depth * 12}px` }
}

function DirNode({ entry, depth, onOpenFile }: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = async (): Promise<void> => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (children !== null) return
    setLoading(true)
    try {
      const next = await window.api.editor.listDir(entry.path)
      setChildren(next)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[editor] listDir failed:', (err as Error).message)
      setChildren([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-center gap-1 truncate py-0.5 text-left text-xs text-white/80 hover:bg-white/5"
        style={indent(depth)}
        title={entry.path}
      >
        <span className="text-white/40">{expanded ? 'v' : '>'}</span>
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && (
        <div>
          {loading && (
            <div className="text-[11px] text-white/30" style={indent(depth + 1)}>
              loading...
            </div>
          )}
          {children?.map((c) =>
            c.isDir ? (
              <DirNode key={c.path} entry={c} depth={depth + 1} onOpenFile={onOpenFile} />
            ) : (
              <FileNode key={c.path} entry={c} depth={depth + 1} onOpenFile={onOpenFile} />
            )
          )}
        </div>
      )}
    </div>
  )
}

function FileNode({ entry, depth, onOpenFile }: NodeProps) {
  return (
    <button
      type="button"
      onClick={() => onOpenFile(entry.path)}
      className="flex w-full items-center gap-1 truncate py-0.5 text-left text-xs text-white/70 hover:bg-white/5"
      style={indent(depth)}
      title={entry.path}
    >
      <span className="text-white/30">-</span>
      <span className="truncate">{entry.name}</span>
    </button>
  )
}

export default function FileTree({ root, onOpenFile }: Props) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    window.api.editor
      .listDir(root)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [root])

  if (error) {
    return <div className="p-2 text-xs text-red-300">tree error: {error}</div>
  }
  if (!entries) {
    return <div className="p-2 text-xs text-white/40">loading...</div>
  }
  return (
    <div className="py-1">
      {entries.map((e) =>
        e.isDir ? (
          <DirNode key={e.path} entry={e} depth={0} onOpenFile={onOpenFile} />
        ) : (
          <FileNode key={e.path} entry={e} depth={0} onOpenFile={onOpenFile} />
        )
      )}
    </div>
  )
}
