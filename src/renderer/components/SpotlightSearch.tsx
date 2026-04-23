/**
 * SpotlightSearch — global, Spotlight-style fuzzy search overlay.
 *
 * Unlike CommandPalette (which surfaces *commands*) this component indexes
 * *objects* the user might want to jump to anywhere in the app:
 *   - Sessions          (name, model, branch, cwd)
 *   - Orchestra Teams   (name, slug)
 *   - Orchestra Agents  (name, role, description)
 *   - Orchestra Tasks   (title, body, tags)
 *   - Projects          (name, path)
 *   - Worktrees         (path, branch)
 *   - Files in current project's cwd (via editor.findInFiles, debounced)
 *
 * Activation is decoupled from keybinds: a parent listens for whatever
 * shortcut it wants and dispatches `spotlight-open` on `window`, which
 * this component observes and forwards to the caller via `onClose`-style
 * controlled `open` prop. (This file doesn't own the event-to-open glue;
 * it only reacts to `open` changing.)
 *
 * Fuzzy scoring is homemade (no new dep): subsequence match with bonuses
 * for prefix / word-boundary / camelCase-boundary hits. A perfect match
 * at the start of the label scores highest; later or scattered matches
 * sink. When the query is empty we show "recent/pinned-ish" entries of
 * each group so the overlay is never blank.
 *
 * File search fires only when the query is non-empty AND a project cwd is
 * known; results are debounced 200ms to avoid spamming the grep bridge.
 * The other six sources are local-only and recompute synchronously.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  FileText,
  FolderTree,
  GitBranch,
  ListTodo,
  Search,
  User,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ProjectMeta, SessionMeta, Worktree } from '../../shared/types'
import type { Agent, Task, Team } from '../../shared/orchestra'
import { useSessions } from '../state/sessions'
import { useProjects } from '../state/projects'
import { useEditor } from '../state/editor'
import { useOrchestra } from '../orchestra/state/orchestra'
import AgentAvatar from './AgentAvatar'

interface Props {
  open: boolean
  onClose: () => void
}

// -----------------------------------------------------------------------------
// Result model
// -----------------------------------------------------------------------------

type Kind = 'session' | 'team' | 'agent' | 'task' | 'project' | 'worktree' | 'file'

interface BaseResult<K extends Kind, T> {
  kind: K
  id: string
  item: T
  title: string
  subtitle: string
  /** Index ranges within `title` that matched — used to bold substrings. */
  titleHits: ReadonlyArray<readonly [number, number]>
  score: number
}

type Result =
  | BaseResult<'session', SessionMeta>
  | BaseResult<'team', Team>
  | BaseResult<'agent', Agent>
  | BaseResult<'task', Task>
  | BaseResult<'project', ProjectMeta>
  | BaseResult<'worktree', Worktree>
  | BaseResult<'file', { path: string; rel: string }>

/** Max visible per group before the "+N more" pill. */
const GROUP_CAP = 4

/** Debounce for remote (findInFiles) searches. */
const FILE_DEBOUNCE_MS = 200

/** Cap on file results even before the group cap kicks in — stop rendering
 *  thousands of <button>s just because grep was generous. */
const FILE_HARD_CAP = 40

// -----------------------------------------------------------------------------
// Fuzzy scoring — subsequence w/ position-aware bonuses. Returns null on miss.
// -----------------------------------------------------------------------------

interface Scored {
  score: number
  hits: Array<[number, number]>
}

/** Is `c` a boundary character (char BEFORE a word start)? */
function isBoundary(c: string | undefined): boolean {
  if (c === undefined) return true
  return /[\s/\\._-]/.test(c)
}

/** Collapse consecutive matched indices into [start,endExclusive] ranges. */
function collapseHits(indices: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const i of indices) {
    const last = out[out.length - 1]
    if (last && last[1] === i) {
      last[1] = i + 1
    } else {
      out.push([i, i + 1])
    }
  }
  return out
}

/** Score haystack/needle; returns null on non-match. Higher is better. */
function fuzzy(haystack: string, needle: string): Scored | null {
  if (!needle) return { score: 0, hits: [] }
  const H = haystack
  const Hl = H.toLowerCase()
  const N = needle.toLowerCase()

  // Fast path: full substring — always beats a scattered subsequence.
  const sub = Hl.indexOf(N)
  if (sub !== -1) {
    let s = 1000 - sub * 4
    if (sub === 0) s += 400
    else if (isBoundary(H[sub - 1])) s += 180
    s -= Math.max(0, H.length - needle.length) // prefer shorter haystacks
    return { score: s, hits: [[sub, sub + needle.length]] }
  }

  // Subsequence walk with position-aware bonuses.
  let hi = 0
  const indices: number[] = []
  for (let ni = 0; ni < N.length; ni++) {
    const ch = N[ni]
    let found = -1
    for (let j = hi; j < Hl.length; j++) {
      if (Hl[j] === ch) {
        found = j
        break
      }
    }
    if (found === -1) return null
    indices.push(found)
    hi = found + 1
  }

  let score = 500
  let prev = -2
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]!
    if (i === prev + 1) score += 18 // adjacent — streak bonus
    else score -= Math.min(20, i - prev) // gap penalty (capped)

    const before = H[i - 1]
    const here = H[i]!
    if (i === 0) score += 60
    else if (isBoundary(before)) score += 45
    else if (here === here.toUpperCase() && here !== here.toLowerCase()) {
      // camelCase boundary
      score += 25
    }
    prev = i
  }
  score -= indices[0]! * 2 // prefer earlier-starting matches
  score -= Math.max(0, H.length - N.length) / 4 // prefer shorter strings

  return { score, hits: collapseHits(indices) }
}

/** Score a whole record against multiple fields; return the best + highlights
 *  aimed at the TITLE field (index 0) so matches light up where the user
 *  looks. We compute over all fields to avoid missing matches that only
 *  exist in the subtitle, but only keep TITLE highlights for readability. */
function scoreFields(fields: readonly string[], q: string): Scored | null {
  let best: Scored | null = null
  let titleHits: Array<[number, number]> = []
  for (let i = 0; i < fields.length; i++) {
    const r = fuzzy(fields[i] ?? '', q)
    if (!r) continue
    if (!best || r.score > best.score) {
      best = { score: r.score, hits: r.hits }
      titleHits = i === 0 ? r.hits : []
    }
  }
  if (!best) return null
  return { score: best.score, hits: titleHits }
}

// -----------------------------------------------------------------------------
// Highlight renderer
// -----------------------------------------------------------------------------

function Highlighted({
  text,
  hits,
}: {
  text: string
  hits: ReadonlyArray<readonly [number, number]>
}): React.ReactElement {
  if (hits.length === 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (let i = 0; i < hits.length; i++) {
    const [a, b] = hits[i]!
    if (a > cursor) parts.push(<span key={`p${i}`}>{text.slice(cursor, a)}</span>)
    parts.push(
      <mark
        key={`m${i}`}
        className="bg-transparent font-semibold text-accent-1 underline decoration-accent-1/50 decoration-1 underline-offset-2"
      >
        {text.slice(a, b)}
      </mark>,
    )
    cursor = b
  }
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)
  return <>{parts}</>
}

// -----------------------------------------------------------------------------
// Group config
// -----------------------------------------------------------------------------

const GROUP_ORDER: Kind[] = [
  'session',
  'team',
  'agent',
  'task',
  'project',
  'worktree',
  'file',
]

const GROUP_LABELS: Record<Kind, string> = {
  session: 'Sessions',
  team: 'Teams',
  agent: 'Agents',
  task: 'Tasks',
  project: 'Projects',
  worktree: 'Worktrees',
  file: 'Files',
}

const GROUP_ICONS: Record<Kind, LucideIcon> = {
  session: User,
  team: Users,
  agent: User,
  task: ListTodo,
  project: FolderTree,
  worktree: GitBranch,
  file: FileText,
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function SpotlightSearch({ open, onClose }: Props): React.ReactElement | null {
  // ----- Store slices (selectors keep re-renders scoped) -----
  const sessions = useSessions((s) => s.sessions)
  const setActiveSession = useSessions((s) => s.setActive)

  const projects = useProjects((s) => s.projects)
  const currentPath = useProjects((s) => s.currentPath)
  const setCurrentProject = useProjects((s) => s.setCurrent)
  const worktrees = useProjects((s) => s.worktrees)

  const teams = useOrchestra((s) => s.teams)
  const agents = useOrchestra((s) => s.agents)
  const tasks = useOrchestra((s) => s.tasks)
  const setActiveTeam = useOrchestra((s) => s.setActiveTeam)
  const setOverlayOpen = useOrchestra((s) => s.setOverlayOpen)
  const selectAgent = useOrchestra((s) => s.selectAgent)
  const setInspectorOpen = useOrchestra((s) => s.setInspectorOpen)
  const setTaskDrawer = useOrchestra((s) => s.setTaskDrawer)

  const openFile = useEditor((s) => s.openFile)
  const openEditor = useEditor((s) => s.openEditor)

  // ----- Local UI state -----
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [fileMatches, setFileMatches] = useState<Array<{ path: string; rel: string }>>([])
  const [fileLoading, setFileLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  /** Guards against out-of-order findInFiles responses. */
  const fileRunId = useRef(0)

  // Reset whenever the overlay opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    setFileMatches([])
    setFileLoading(false)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  // ----- File search (debounced) -----
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q || !currentPath) {
      setFileMatches([])
      setFileLoading(false)
      return
    }
    const id = ++fileRunId.current
    setFileLoading(true)
    const handle = setTimeout(() => {
      void window.api.editor
        .findInFiles(currentPath, q, {})
        .then((res) => {
          if (id !== fileRunId.current) return
          if (!res.ok) {
            setFileMatches([])
            return
          }
          const seen = new Set<string>()
          const out: Array<{ path: string; rel: string }> = []
          for (const m of res.value.matches) {
            if (seen.has(m.file)) continue
            seen.add(m.file)
            const rel = m.file.startsWith(currentPath)
              ? m.file.slice(currentPath.length).replace(/^[/\\]/, '')
              : m.file
            out.push({ path: m.file, rel })
            if (out.length >= FILE_HARD_CAP) break
          }
          setFileMatches(out)
        })
        .catch(() => {
          if (id === fileRunId.current) setFileMatches([])
        })
        .finally(() => {
          if (id === fileRunId.current) setFileLoading(false)
        })
    }, FILE_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [open, query, currentPath])

  // ----- Build grouped results -----
  const grouped = useMemo(() => {
    const q = query.trim()
    const out: Record<Kind, Result[]> = {
      session: [],
      team: [],
      agent: [],
      task: [],
      project: [],
      worktree: [],
      file: [],
    }

    // Sessions
    for (const s of sessions) {
      const fields = [s.name, s.model ?? '', s.branch ?? '', s.cwd, s.worktreePath ?? '']
      if (q) {
        const sc = scoreFields(fields, q)
        if (!sc) continue
        out.session.push({
          kind: 'session',
          id: s.id,
          item: s,
          title: s.name,
          subtitle: `${s.branch ?? '—'} · ${s.model ?? 'sonnet'}`,
          titleHits: sc.hits,
          score: sc.score,
        })
      } else {
        out.session.push({
          kind: 'session',
          id: s.id,
          item: s,
          title: s.name,
          subtitle: `${s.branch ?? '—'} · ${s.model ?? 'sonnet'}`,
          titleHits: [],
          score: 0,
        })
      }
    }

    // Teams
    for (const t of teams) {
      if (q) {
        const sc = scoreFields([t.name, t.slug], q)
        if (!sc) continue
        out.team.push({
          kind: 'team',
          id: t.id,
          item: t,
          title: t.name,
          subtitle: t.slug,
          titleHits: sc.hits,
          score: sc.score,
        })
      } else {
        out.team.push({
          kind: 'team',
          id: t.id,
          item: t,
          title: t.name,
          subtitle: t.slug,
          titleHits: [],
          score: 0,
        })
      }
    }

    // Agents
    for (const a of agents) {
      if (q) {
        const sc = scoreFields([a.name, a.role, a.description], q)
        if (!sc) continue
        out.agent.push({
          kind: 'agent',
          id: a.id,
          item: a,
          title: a.name,
          subtitle: a.role || 'agent',
          titleHits: sc.hits,
          score: sc.score,
        })
      } else {
        out.agent.push({
          kind: 'agent',
          id: a.id,
          item: a,
          title: a.name,
          subtitle: a.role || 'agent',
          titleHits: [],
          score: 0,
        })
      }
    }

    // Tasks
    for (const t of tasks) {
      if (q) {
        const sc = scoreFields([t.title, t.body, t.tags.join(' ')], q)
        if (!sc) continue
        out.task.push({
          kind: 'task',
          id: t.id,
          item: t,
          title: t.title,
          subtitle: `${t.priority} · ${t.status}`,
          titleHits: sc.hits,
          score: sc.score,
        })
      } else {
        out.task.push({
          kind: 'task',
          id: t.id,
          item: t,
          title: t.title,
          subtitle: `${t.priority} · ${t.status}`,
          titleHits: [],
          score: 0,
        })
      }
    }

    // Projects
    for (const p of projects) {
      if (q) {
        const sc = scoreFields([p.name, p.path], q)
        if (!sc) continue
        out.project.push({
          kind: 'project',
          id: p.path,
          item: p,
          title: p.name,
          subtitle: p.path,
          titleHits: sc.hits,
          score: sc.score,
        })
      } else {
        out.project.push({
          kind: 'project',
          id: p.path,
          item: p,
          title: p.name,
          subtitle: p.path,
          titleHits: [],
          score: 0,
        })
      }
    }

    // Worktrees
    for (const w of worktrees) {
      const label = w.branch || w.path
      if (q) {
        const sc = scoreFields([w.branch, w.path], q)
        if (!sc) continue
        out.worktree.push({
          kind: 'worktree',
          id: w.path,
          item: w,
          title: label,
          subtitle: w.path,
          titleHits: sc.hits,
          score: sc.score,
        })
      } else {
        out.worktree.push({
          kind: 'worktree',
          id: w.path,
          item: w,
          title: label,
          subtitle: w.path,
          titleHits: [],
          score: 0,
        })
      }
    }

    // Files — only when we actually queried
    if (q) {
      for (const f of fileMatches) {
        const sc = scoreFields([f.rel, f.path], q)
        if (!sc) continue
        const parts = f.rel.split(/[/\\]/)
        const leaf = parts[parts.length - 1] ?? f.rel
        const dir = parts.slice(0, -1).join('/')
        out.file.push({
          kind: 'file',
          id: f.path,
          item: f,
          title: leaf,
          subtitle: dir || f.path,
          titleHits: [],
          score: sc.score,
        })
      }
    }

    // Sort + cap
    for (const k of GROUP_ORDER) {
      out[k].sort((a, b) => b.score - a.score)
    }
    return out
  }, [query, sessions, teams, agents, tasks, projects, worktrees, fileMatches])

  // Flat list of cursor-addressable rows in display order (capped per group).
  const flat = useMemo<Result[]>(() => {
    const acc: Result[] = []
    for (const k of GROUP_ORDER) {
      const list = grouped[k].slice(0, GROUP_CAP)
      acc.push(...list)
    }
    return acc
  }, [grouped])

  // Keep the cursor inside the visible range whenever the list reshuffles.
  useEffect(() => {
    if (cursor >= flat.length) setCursor(Math.max(0, flat.length - 1))
  }, [flat.length, cursor])

  // Scroll the active row into view.
  useEffect(() => {
    const host = listRef.current
    if (!host) return
    const el = host.querySelector(`[data-spot-idx="${cursor}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [cursor])

  // ----- Activation -----
  const activate = useCallback(
    (r: Result) => {
      switch (r.kind) {
        case 'session':
          setActiveSession(r.item.id)
          break
        case 'team':
          setActiveTeam(r.item.id)
          setOverlayOpen(true)
          break
        case 'agent':
          selectAgent(r.item.id, false)
          setInspectorOpen(true)
          setOverlayOpen(true)
          break
        case 'task':
          setTaskDrawer(r.item.id)
          setOverlayOpen(true)
          break
        case 'project':
          void setCurrentProject(r.item.path)
          break
        case 'worktree':
          window.dispatchEvent(
            new CustomEvent('editor:open-worktree', {
              detail: { path: r.item.path, branch: r.item.branch },
            }),
          )
          openEditor()
          break
        case 'file':
          void openFile(r.item.path)
          openEditor()
          break
      }
      onClose()
    },
    [
      onClose,
      setActiveSession,
      setActiveTeam,
      setOverlayOpen,
      selectAgent,
      setInspectorOpen,
      setTaskDrawer,
      setCurrentProject,
      openEditor,
      openFile,
    ],
  )

  // ----- Keyboard -----
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => (flat.length === 0 ? 0 : (c + 1) % flat.length))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => (flat.length === 0 ? 0 : (c - 1 + flat.length) % flat.length))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const target = flat[cursor]
        if (target) activate(target)
      }
    },
    [activate, cursor, flat, onClose],
  )

  if (!open) return null

  // Total visible rows (after cap) for the cursor <-> flat index map.
  let runningIdx = -1

  const renderRowContent = (r: Result): React.ReactElement => {
    const KindIcon = GROUP_ICONS[r.kind]
    switch (r.kind) {
      case 'session':
        return (
          <>
            <AgentAvatar session={r.item} size={20} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-text-1">
                <Highlighted text={r.title} hits={r.titleHits} />
              </div>
              <div className="truncate font-mono text-[11px] text-text-4">{r.subtitle}</div>
            </div>
          </>
        )
      case 'agent':
        return (
          <>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase text-text-1"
              style={{ background: r.item.color ?? '#4b5563' }}
              aria-hidden
            >
              {r.item.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-text-1">
                <Highlighted text={r.title} hits={r.titleHits} />
              </div>
              <div className="truncate text-[11px] text-text-4">{r.subtitle}</div>
            </div>
          </>
        )
      default:
        return (
          <>
            <KindIcon size={14} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-text-1">
                <Highlighted text={r.title} hits={r.titleHits} />
              </div>
              <div className="truncate font-mono text-[11px] text-text-4">{r.subtitle}</div>
            </div>
          </>
        )
    }
  }

  const totalShown = flat.length
  const anyHidden = GROUP_ORDER.some((k) => grouped[k].length > GROUP_CAP)

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/55 px-4 pt-[18vh] backdrop-blur-md df-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Spotlight search"
    >
      <div
        className="flex w-full max-w-[680px] flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{ borderRadius: 'var(--radius-lg)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Large input */}
        <div className="flex items-center gap-3 border-b border-border-soft bg-bg-1 px-4 py-3">
          <Search size={18} strokeWidth={1.75} className="shrink-0 text-text-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            placeholder="Search anything…"
            className="flex-1 bg-transparent text-base text-text-1 placeholder:text-text-4 focus:outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          {fileLoading ? (
            <span className="font-mono text-[10px] text-text-4">searching…</span>
          ) : null}
          <span className="shrink-0 rounded-sm border border-border-soft bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-text-4">
            esc
          </span>
        </div>

        {/* Groups */}
        <div ref={listRef} className="df-scroll max-h-[58vh] overflow-y-auto">
          {totalShown === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-4">
              {query.trim() ? 'No matches' : 'Start typing to search'}
            </div>
          ) : (
            GROUP_ORDER.map((kind) => {
              const all = grouped[kind]
              if (all.length === 0) return null
              const list = all.slice(0, GROUP_CAP)
              const HeaderIcon = GROUP_ICONS[kind]
              const extra = all.length - list.length
              return (
                <div key={kind} className="py-1.5">
                  <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-3">
                    <HeaderIcon size={11} strokeWidth={2} className="opacity-70" aria-hidden />
                    <span>{GROUP_LABELS[kind]}</span>
                    <span className="ml-1 rounded-sm border border-border-soft bg-bg-2 px-1 py-px font-mono text-[10px] text-text-4">
                      {all.length}
                    </span>
                    {extra > 0 ? (
                      <span className="ml-auto font-normal normal-case tracking-normal text-text-4">
                        +{extra} more
                      </span>
                    ) : null}
                  </div>
                  {list.map((r) => {
                    runningIdx++
                    const idx = runningIdx
                    const active = idx === cursor
                    return (
                      <button
                        key={`${r.kind}:${r.id}`}
                        data-spot-idx={idx}
                        type="button"
                        onClick={() => activate(r)}
                        onMouseEnter={() => setCursor(idx)}
                        className={`group flex w-full items-center gap-3 px-3 py-2 text-left ${
                          active ? 'bg-bg-4 text-text-1' : 'text-text-2 hover:bg-bg-3'
                        }`}
                      >
                        {renderRowContent(r)}
                        <span className="ml-2 shrink-0 rounded-sm border border-border-soft bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-4">
                          {r.kind}
                        </span>
                        <ArrowRight
                          size={13}
                          strokeWidth={1.75}
                          className={`shrink-0 text-text-4 transition-opacity ${
                            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
                          }`}
                          aria-hidden
                        />
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-soft bg-bg-1 px-3 py-1.5 font-mono text-[10px] text-text-4">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>
            {totalShown} shown
            {anyHidden ? ' · more hidden' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Hook helper — wire the `spotlight-open` window event to a local open flag.
//
// Exported so callers can do:
//     const [open, setOpen] = useSpotlightWindowEvent()
//     return <SpotlightSearch open={open} onClose={() => setOpen(false)} />
//
// Kept in this file (no new file created) so consumers don't need a second
// import. This is intentionally the smallest possible surface — no keybind
// owning, no focus stealing — exactly as the spec requires ("caller can bind
// any key").
// -----------------------------------------------------------------------------

export function useSpotlightWindowEvent(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const handler = (): void => setOpen(true)
    window.addEventListener('spotlight-open', handler as EventListener)
    return () => window.removeEventListener('spotlight-open', handler as EventListener)
  }, [])
  return [open, setOpen]
}
