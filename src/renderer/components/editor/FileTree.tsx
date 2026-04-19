import { useEffect, useState } from 'react'
import { AlertCircle, ChevronRight, File as FileIcon, Folder, Loader2 } from 'lucide-react'
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

function rowPad(depth: number): string {
  // Tailwind doesn't handle truly dynamic class names; use inline padding for indents.
  return `${10 + depth * 12}px`
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
        className="flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left text-xs text-text-2 hover:bg-bg-3 hover:text-text-1"
        style={{ paddingLeft: rowPad(depth) }}
        title={entry.path}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={`shrink-0 text-text-4 transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <Folder size={14} strokeWidth={1.75} className="shrink-0 text-accent-400" />
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && (
        <div>
          {loading && (
            <div
              className="flex items-center gap-1.5 py-1 text-[11px] text-text-4"
              style={{ paddingLeft: rowPad(depth + 1) }}
            >
              <Loader2 size={11} className="animate-spin" />
              Loading…
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
  // Files are indented one chevron-width past their depth so they line up with
  // sibling folders' icons (which sit after the chevron).
  const padPx = 10 + depth * 12 + 14
  return (
    <button
      type="button"
      onClick={() => onOpenFile(entry.path)}
      className="flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left text-xs text-text-3 hover:bg-bg-3 hover:text-text-1"
      style={{ paddingLeft: `${padPx}px` }}
      title={entry.path}
    >
      <FileIcon size={14} strokeWidth={1.5} className="shrink-0 text-text-4" />
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
    return (
      <div className="m-3 flex items-start gap-2 rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-sm text-status-attention">
        <AlertCircle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <div className="break-words">{error}</div>
      </div>
    )
  }
  if (!entries) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-3">
        <Loader2 size={12} className="animate-spin" /> Loading…
      </div>
    )
  }
  return (
    <div className="py-1.5">
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
