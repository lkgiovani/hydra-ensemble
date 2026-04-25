import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  ChevronRight,
  Clipboard,
  ClipboardPaste,
  File as FileIcon,
  Folder,
  Loader2,
  Search as SearchIcon,
  Trash2
} from 'lucide-react'
import type { DirEntry } from '../../../shared/types'
import { getActiveView } from './CodeMirrorView'
import { useEditorExpansion } from '../../state/editorSettings'

interface Props {
  root: string
  onOpenFile: (path: string) => void
  /** Optional session id used to remember which folders the user had
   *  expanded the last time this session was active. Persists for the
   *  renderer's lifetime; not written to disk. */
  sessionId?: string | null
  /** Optional breadcrumb shown above the tree — typically the agent
   *  name + repo basename. Click resets the expanded folders. */
  breadcrumb?: string | null
}

interface MenuState {
  entry: DirEntry
  x: number
  y: number
}

/** Flat node descriptor used by the keyboard-navigation engine. */
interface FlatNode {
  entry: DirEntry
  /** Depth from the visible root (0 = direct child of `root`). */
  depth: number
  /** True for an expanded directory; false for a file or collapsed dir. */
  expanded: boolean
  /** Path of the parent dir as visible in the tree, or null for top level. */
  parentPath: string | null
}

const SEARCH_PLACEHOLDER = 'Filter files (press / to focus)'

/**
 * Filesystem tree.
 *
 * Behaviour overview:
 *   - Loads `root` lazily one level at a time.
 *   - Click toggles a folder; click on a file opens it.
 *   - Right-click brings up a context menu (copy / paste / delete).
 *   - Keyboard navigation (when focus is inside the tree):
 *       Arrow up/down — move focus up/down through visible nodes.
 *       Arrow left/right — collapse/expand a folder, or move to parent.
 *       Enter — open the focused file (focus stays on the tree).
 *       Shift+Enter — open file AND move focus to the editor pane.
 *       Home/End — jump to first/last visible node.
 *       '/' — focus the search input above the tree.
 *
 * The tree maintains a flat "visible nodes" projection so we can do
 * navigation without recursing through the rendered React tree.
 */
export default function FileTree({ root, onOpenFile, sessionId, breadcrumb }: Props) {
  const expandedBySession = useEditorExpansion((s) => s.expandedBySession)
  const setExpandedForSession = useEditorExpansion((s) => s.setExpanded)
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Last clicked entry. Drives selection highlight and the paste target
  // (its path for a folder, its parent for a file).
  const [selected, setSelected] = useState<DirEntry | null>(null)
  // Absolute path currently on the clipboard (this app's internal one,
  // not the OS clipboard — file paths on the OS clipboard don't map
  // cleanly to a recursive copy action).
  const [clipboard, setClipboard] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Bumped after a successful paste/delete so any expanded DirNode reloads.
  const [refreshToken, setRefreshToken] = useState(0)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DirEntry | null>(null)

  // Keyboard navigation state. `expanded` is the canonical set of open
  // folders; the DirNode subtrees subscribe to it. `cache` is a lazy
  // map of folderPath → child entries (so navigation can walk the
  // subtree without re-listing on every keystroke).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [childrenCache, setChildrenCache] = useState<Record<string, DirEntry[] | undefined>>({})
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const showToast = (msg: string, ms = 1800): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), ms)
  }

  // Load top-level entries when root changes. Restore the per-session
  // expanded folder set so flipping back to a session puts the tree in
  // roughly the state the user left it. Memory only — restored paths
  // that no longer exist will simply not appear in the visible flat
  // projection (the listDir for them will yield nothing).
  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    setSelected(null)
    const restored = sessionId ? expandedBySession[sessionId] : undefined
    setExpanded(new Set(restored ?? []))
    setChildrenCache({})
    setFocusedPath(null)
    setFilter('')
    window.api.editor
      .listDir(root)
      .then(async (rows) => {
        if (cancelled) return
        setEntries(rows)
        // Re-list any restored folders so navigation has child entries.
        if (restored) {
          for (const folder of restored) {
            try {
              const kids = await window.api.editor.listDir(folder)
              if (cancelled) return
              setChildrenCache((m) => ({ ...m, [folder]: kids }))
            } catch {
              /* tolerate disappeared folders */
            }
          }
        }
        // Tree was just rerooted — start at the top.
        const scroller = containerRef.current?.querySelector('.df-scroll')
        scroller?.scrollTo({ top: 0, behavior: 'auto' })
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, refreshToken, sessionId])

  // Persist the expanded set whenever it changes so flipping sessions
  // and back gets the user the same view they left.
  useEffect(() => {
    if (!sessionId) return
    setExpandedForSession(sessionId, [...expanded])
  }, [expanded, sessionId, setExpandedForSession])

  // Helper to load (or return cached) children for a folder.
  const ensureChildren = useCallback(
    async (path: string): Promise<DirEntry[]> => {
      const cached = childrenCache[path]
      if (cached) return cached
      try {
        const rows = await window.api.editor.listDir(path)
        setChildrenCache((m) => ({ ...m, [path]: rows }))
        return rows
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[editor] listDir failed:', (err as Error).message)
        setChildrenCache((m) => ({ ...m, [path]: [] }))
        return []
      }
    },
    [childrenCache]
  )

  const setNodeExpanded = useCallback(
    (path: string, value: boolean): void => {
      setExpanded((prev) => {
        const isExpanded = prev.has(path)
        if (value === isExpanded) return prev
        const next = new Set(prev)
        if (value) next.add(path)
        else next.delete(path)
        return next
      })
    },
    []
  )

  // Filter check — lowercase substring match on the basename. An empty
  // filter matches every node.
  const matchesFilter = useCallback(
    (entry: DirEntry): boolean => {
      if (!filter) return true
      return entry.name.toLowerCase().includes(filter.toLowerCase())
    },
    [filter]
  )

  // Build the visible-node projection for navigation. Folders are
  // visible whenever their parent chain is expanded; files are visible
  // when their parent is open. The walker is iterative (BFS-ish DFS)
  // so deep trees don't blow the stack.
  const visibleNodes = useMemo<FlatNode[]>(() => {
    if (!entries) return []
    const out: FlatNode[] = []
    const visit = (
      list: readonly DirEntry[],
      depth: number,
      parentPath: string | null
    ): void => {
      for (const e of list) {
        const isExpanded = expanded.has(e.path)
        if (matchesFilter(e) || (e.isDir && hasMatchingDescendant(e.path))) {
          out.push({ entry: e, depth, expanded: isExpanded, parentPath })
        }
        if (e.isDir && isExpanded) {
          const kids = childrenCache[e.path]
          if (kids) visit(kids, depth + 1, e.path)
        }
      }
    }
    // Closure: returns true if any cached descendant matches the filter.
    // Without filter, always true.
    const hasMatchingDescendant = (path: string): boolean => {
      if (!filter) return true
      const kids = childrenCache[path]
      if (!kids) return false
      return kids.some(
        (k) => matchesFilter(k) || (k.isDir && hasMatchingDescendant(k.path))
      )
    }
    visit(entries, 0, null)
    return out
  }, [entries, expanded, childrenCache, filter, matchesFilter])

  // Keep focus aimed at a still-visible node. If the user collapses a
  // folder containing the focused node, drop focus to the folder.
  useEffect(() => {
    if (!focusedPath) return
    if (visibleNodes.some((n) => n.entry.path === focusedPath)) return
    setFocusedPath(visibleNodes[0]?.entry.path ?? null)
  }, [visibleNodes, focusedPath])

  const moveFocus = (delta: number): void => {
    if (visibleNodes.length === 0) return
    const i = focusedPath
      ? visibleNodes.findIndex((n) => n.entry.path === focusedPath)
      : -1
    const next = Math.min(visibleNodes.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta))
    setFocusedPath(visibleNodes[next]?.entry.path ?? null)
  }

  const focusFirst = (): void => {
    setFocusedPath(visibleNodes[0]?.entry.path ?? null)
  }
  const focusLast = (): void => {
    setFocusedPath(visibleNodes[visibleNodes.length - 1]?.entry.path ?? null)
  }

  const focusParent = (path: string): void => {
    const node = visibleNodes.find((n) => n.entry.path === path)
    if (!node || !node.parentPath) return
    setFocusedPath(node.parentPath)
  }

  // Keyboard handler attached to the tree's root container. Only fires
  // when the focused element is inside the container so the rest of
  // the app's shortcuts keep working.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.target === searchInputRef.current && e.key !== 'Escape') {
      // Let the input handle most keys naturally. Escape clears the
      // filter and returns focus to the tree.
      return
    }
    if (e.key === '/') {
      e.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
      return
    }
    if (visibleNodes.length === 0) return
    const focused = focusedPath
      ? visibleNodes.find((n) => n.entry.path === focusedPath)
      : null
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveFocus(1)
        return
      case 'ArrowUp':
        e.preventDefault()
        moveFocus(-1)
        return
      case 'Home':
        e.preventDefault()
        focusFirst()
        return
      case 'End':
        e.preventDefault()
        focusLast()
        return
      case 'ArrowRight':
        if (!focused) return
        e.preventDefault()
        if (focused.entry.isDir) {
          if (!focused.expanded) {
            void ensureChildren(focused.entry.path).then(() => {
              setNodeExpanded(focused.entry.path, true)
            })
          } else {
            // Already open — drop focus to the first child if any.
            const idx = visibleNodes.findIndex(
              (n) => n.entry.path === focused.entry.path
            )
            const child = visibleNodes[idx + 1]
            if (child && child.depth === focused.depth + 1) {
              setFocusedPath(child.entry.path)
            }
          }
        }
        return
      case 'ArrowLeft':
        if (!focused) return
        e.preventDefault()
        if (focused.entry.isDir && focused.expanded) {
          setNodeExpanded(focused.entry.path, false)
        } else if (focused.parentPath) {
          focusParent(focused.entry.path)
        }
        return
      case 'Enter':
        if (!focused) return
        e.preventDefault()
        if (focused.entry.isDir) {
          if (focused.expanded) {
            setNodeExpanded(focused.entry.path, false)
          } else {
            void ensureChildren(focused.entry.path).then(() =>
              setNodeExpanded(focused.entry.path, true)
            )
          }
        } else {
          onOpenFile(focused.entry.path)
          setSelected(focused.entry)
          if (e.shiftKey) {
            // Hand focus to the active editor view on Shift+Enter.
            requestAnimationFrame(() => {
              const view = getActiveView()
              if (view) view.focus()
            })
          }
        }
        return
      case ' ':
        if (!focused || focused.entry.isDir) return
        e.preventDefault()
        onOpenFile(focused.entry.path)
        setSelected(focused.entry)
        return
      case 'Escape':
        if (filter) {
          e.preventDefault()
          setFilter('')
          containerRef.current?.focus()
        }
        return
      default:
        return
    }
  }

  // Close menu on outside click / escape / scroll.
  useEffect(() => {
    if (!menu) return
    const onDown = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('wheel', onDown, { passive: true })
    window.addEventListener('resize', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('wheel', onDown)
      window.removeEventListener('resize', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const pasteTargetFor = (entry: DirEntry): string => {
    if (entry.isDir) return entry.path
    const sep = entry.path.includes('\\') ? '\\' : '/'
    const idx = entry.path.lastIndexOf(sep)
    return idx > 0 ? entry.path.slice(0, idx) : root
  }

  const doCopy = (entry: DirEntry): void => {
    setClipboard(entry.path)
    showToast(`copied: ${entry.name}`)
  }

  const doPaste = async (entry: DirEntry): Promise<void> => {
    if (!clipboard) return
    const dest = pasteTargetFor(entry)
    setBusy(true)
    try {
      const final = await window.api.editor.copyPath(clipboard, dest)
      const name = final.split(/[\\/]/).pop() ?? final
      showToast(`pasted: ${name}`, 2400)
      setRefreshToken((n) => n + 1)
    } catch (err) {
      showToast(`paste failed: ${(err as Error).message}`, 2800)
    } finally {
      setBusy(false)
    }
  }

  const requestDelete = (entry: DirEntry): void => {
    setPendingDelete(entry)
  }

  const confirmDelete = async (): Promise<void> => {
    const entry = pendingDelete
    if (!entry) return
    setPendingDelete(null)
    setBusy(true)
    try {
      await window.api.editor.deletePath(entry.path)
      showToast(`deleted: ${entry.name}`, 2000)
      if (clipboard === entry.path) setClipboard(null)
      if (selected?.path === entry.path) setSelected(null)
      setRefreshToken((n) => n + 1)
    } catch (err) {
      showToast(`delete failed: ${(err as Error).message}`, 3500)
    } finally {
      setBusy(false)
    }
  }

  const openMenu = (entry: DirEntry, x: number, y: number): void => {
    setMenu({ entry, x, y })
  }

  // Shared callback for DirNode/FileNode click handlers — sets the
  // focused path so keyboard nav resumes from the user's last click.
  const handleSelect = useCallback((entry: DirEntry): void => {
    setSelected(entry)
    setFocusedPath(entry.path)
  }, [])

  const resetView = (): void => {
    setExpanded(new Set())
    if (sessionId) setExpandedForSession(sessionId, [])
    setFocusedPath(null)
    setFilter('')
    const scroller = containerRef.current?.querySelector('.df-scroll')
    scroller?.scrollTo({ top: 0, behavior: 'auto' })
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {breadcrumb ? (
        <button
          type="button"
          onClick={resetView}
          className="shrink-0 truncate border-b border-border-soft bg-bg-2 px-2 py-1 text-left font-mono text-[10px] text-text-3 hover:bg-bg-3 hover:text-text-1"
          title="Click to reset view (collapse all + scroll to top)"
        >
          {breadcrumb}
        </button>
      ) : null}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border-soft bg-bg-2 px-2 py-1">
        <SearchIcon size={11} strokeWidth={1.75} className="text-text-4" />
        <input
          ref={searchInputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setFilter('')
              containerRef.current?.focus()
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              containerRef.current?.focus()
              focusFirst()
            }
          }}
          placeholder={SEARCH_PLACEHOLDER}
          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-text-1 placeholder:text-text-4 focus:outline-none"
        />
        {filter ? (
          <button
            type="button"
            onClick={() => {
              setFilter('')
              containerRef.current?.focus()
            }}
            className="rounded-sm p-0.5 text-text-4 hover:bg-bg-3 hover:text-text-1"
            aria-label="Clear filter"
            title="Clear filter (Esc)"
          >
            x
          </button>
        ) : null}
      </div>
      {toast ? (
        <div className="shrink-0 border-b border-border-soft bg-bg-2 px-2 py-1 font-mono text-[10px] text-text-3">
          {toast}
        </div>
      ) : null}
      <div className="df-scroll min-h-0 flex-1 overflow-y-auto py-1.5">
        {error ? (
          <div className="m-3 flex items-start gap-2 rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-sm text-status-attention">
            <AlertCircle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <div className="break-words">{error}</div>
          </div>
        ) : !entries ? (
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-3">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        ) : visibleNodes.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-text-4">no matches</div>
        ) : (
          visibleNodes.map((node) => (
            <FlatRow
              key={node.entry.path}
              node={node}
              focused={focusedPath === node.entry.path}
              selected={selected?.path === node.entry.path}
              onClick={() => {
                handleSelect(node.entry)
                if (node.entry.isDir) {
                  if (node.expanded) setNodeExpanded(node.entry.path, false)
                  else
                    void ensureChildren(node.entry.path).then(() =>
                      setNodeExpanded(node.entry.path, true)
                    )
                } else {
                  onOpenFile(node.entry.path)
                }
              }}
              onContextMenu={(x, y) => {
                handleSelect(node.entry)
                openMenu(node.entry, x, y)
              }}
            />
          ))
        )}
      </div>

      {menu
        ? createPortal(
            <ContextMenu
              menu={menu}
              busy={busy}
              hasClipboard={!!clipboard}
              onCopy={() => {
                doCopy(menu.entry)
                setMenu(null)
              }}
              onPaste={() => {
                void doPaste(menu.entry)
                setMenu(null)
              }}
              onDelete={() => {
                requestDelete(menu.entry)
                setMenu(null)
              }}
            />,
            document.body
          )
        : null}

      {pendingDelete
        ? createPortal(
            <ConfirmModal
              title="Delete?"
              message={`Delete ${pendingDelete.name}? This cannot be undone.`}
              confirmLabel="Delete"
              danger
              busy={busy}
              onCancel={() => setPendingDelete(null)}
              onConfirm={() => void confirmDelete()}
            />,
            document.body
          )
        : null}
    </div>
  )
}

interface FlatRowProps {
  node: FlatNode
  focused: boolean
  selected: boolean
  onClick: () => void
  onContextMenu: (x: number, y: number) => void
}

function FlatRow({ node, focused, selected, onClick, onContextMenu }: FlatRowProps) {
  const { entry, depth, expanded } = node
  const ref = useRef<HTMLButtonElement>(null)
  // Pull the focused row into view when it gets focus from keyboard nav.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [focused])
  // Roving tabindex: only the focused node owns tabIndex=0 so Tab from
  // outside lands on that single anchor instead of every node.
  const tabIndex = focused ? 0 : -1
  // Indent: 10px base + 12px per depth + 14px when this is a file (so
  // file icons line up with sibling folder icons after the chevron).
  const padPx = entry.isDir ? 10 + depth * 12 : 10 + depth * 12 + 14
  return (
    <button
      ref={(node) => {
        ref.current = node
        if (focused && node && document.activeElement !== node) {
          node.focus({ preventScroll: true })
        }
      }}
      type="button"
      data-tree-node="1"
      tabIndex={tabIndex}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e.clientX, e.clientY)
      }}
      className={`flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left text-xs hover:bg-bg-3 hover:text-text-1 focus:outline-none focus:ring-1 focus:ring-accent-500/60 ${
        selected
          ? 'bg-accent-500/15 text-text-1'
          : focused
            ? 'bg-bg-3 text-text-1'
            : entry.isDir
              ? 'text-text-2'
              : 'text-text-3'
      }`}
      style={{ paddingLeft: `${padPx}px` }}
      title={entry.path}
    >
      {entry.isDir ? (
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={`shrink-0 text-text-4 transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      ) : null}
      {entry.isDir ? (
        <Folder size={14} strokeWidth={1.75} className="shrink-0 text-accent-400" />
      ) : (
        <FileIcon size={14} strokeWidth={1.5} className="shrink-0 text-text-4" />
      )}
      <span className="truncate">{entry.name}</span>
    </button>
  )
}

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm
}: ConfirmModalProps) {
  // Escape cancels, Enter confirms. Backdrop click cancels too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onMouseDown={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[360px] max-w-[90vw] overflow-hidden rounded-md border border-border-mid bg-bg-2 shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-soft px-4 py-2 text-sm font-semibold text-text-1">
          {title}
        </div>
        <div className="px-4 py-3 text-xs text-text-2">{message}</div>
        <div className="flex justify-end gap-2 border-t border-border-soft bg-bg-1/50 px-3 py-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-sm border border-border-soft bg-bg-3 px-3 py-1 text-xs text-text-2 hover:bg-bg-4 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={`rounded-sm px-3 py-1 text-xs font-medium text-white disabled:opacity-40 ${
              danger
                ? 'bg-status-attention/80 hover:bg-status-attention'
                : 'bg-accent-500 hover:bg-accent-400'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ContextMenuProps {
  menu: MenuState
  busy: boolean
  hasClipboard: boolean
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
}

function ContextMenu({
  menu,
  busy,
  hasClipboard,
  onCopy,
  onPaste,
  onDelete
}: ContextMenuProps) {
  // Nudge the menu inside the viewport so the right/bottom edge doesn't
  // clip. 160px/120px is close enough to the real size; we avoid a
  // ResizeObserver here because the menu is tiny and short-lived.
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.min(menu.x, vw - 170)
  const top = Math.min(menu.y, vh - 130)
  return (
    <div
      className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-border-mid bg-bg-2 py-1 text-xs text-text-2 shadow-xl shadow-black/40"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <MenuItem
        icon={<Clipboard size={12} strokeWidth={1.75} />}
        label="Copy"
        onClick={onCopy}
      />
      <MenuItem
        icon={<ClipboardPaste size={12} strokeWidth={1.75} />}
        label="Paste"
        onClick={onPaste}
        disabled={!hasClipboard || busy}
        hint={hasClipboard ? undefined : 'clipboard is empty'}
      />
      <div className="my-1 h-px bg-border-soft" />
      <MenuItem
        icon={<Trash2 size={12} strokeWidth={1.75} />}
        label="Delete"
        onClick={onDelete}
        disabled={busy}
        danger
      />
    </div>
  )
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  hint?: string
}

function MenuItem({ icon, label, onClick, disabled, danger, hint }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-3 disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-status-attention hover:text-status-attention' : ''
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
