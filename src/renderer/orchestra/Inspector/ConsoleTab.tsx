import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Pause, Play, Trash2 } from 'lucide-react'
import type { Agent, MessageKind, MessageLog } from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'

interface Props {
  agent: Agent
}

/** Local per-view cap. Above this, oldest rows are truncated and a pill shows
 *  how many were dropped. The store itself caps at 500 too — this is just the
 *  same cap applied independently here so the tab stays responsive even if
 *  that ever changes. */
const MAX_LOCAL = 500

type FilterKind = 'all' | 'output' | 'status' | 'error'

/** How close to the bottom counts as "still following". Anything within this
 *  many pixels of the bottom is treated as at-bottom so tiny rounding deltas
 *  or a fresh render don't flip us into paused mode. */
const STICK_THRESHOLD_PX = 32

/** Short kind symbol shown in the header line. Keeps the layout compact and
 *  readable at 11px without leaning on color alone. */
function kindGlyph(kind: MessageKind): string {
  switch (kind) {
    case 'output':
      return '▶'
    case 'error':
      return '⚠'
    case 'delegation':
      return '↳'
    case 'approval_request':
      return '?'
    case 'status':
    default:
      return '·'
  }
}

function kindPillStyles(kind: MessageKind): string {
  switch (kind) {
    case 'output':
      return 'bg-accent-500/15 text-accent-400'
    case 'error':
      return 'bg-status-attention/15 text-status-attention'
    case 'delegation':
      return 'bg-amber-500/15 text-amber-400'
    case 'approval_request':
      return 'bg-amber-500/15 text-amber-400 animate-pulse'
    case 'status':
    default:
      return 'bg-bg-3 text-text-3'
  }
}

/** `HH:MM:SS.mmm` in local time, no date. Avoids Intl to keep alignment
 *  deterministic (fixed-width, no locale-specific AM/PM). */
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--:--.---'
  const pad2 = (n: number): string => n.toString().padStart(2, '0')
  const pad3 = (n: number): string => n.toString().padStart(3, '0')
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`
}

const FILTERS: readonly FilterKind[] = ['all', 'output', 'status', 'error']

export default function ConsoleTab({ agent }: Props) {
  const messageLog = useOrchestra((s) => s.messageLog)

  const [filter, setFilter] = useState<FilterKind>('all')
  // Paused = user scrolled up; we stop pinning the scroll to the bottom.
  const [paused, setPaused] = useState(false)
  // Anything earlier than this index in the agent's own filtered list is
  // hidden. Local-only, doesn't mutate the store. Bumping this to the current
  // length acts as "clear".
  const [hiddenBeforeIdx, setHiddenBeforeIdx] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  // Previous scrollTop, so we can tell "user scrolled up" from "layout grew".
  const prevScrollTopRef = useRef(0)

  // Entries originating from this agent, chronological. Filter+cap+clear are
  // layered on top in the next memo so the base slice stays stable.
  const agentEntries = useMemo<MessageLog[]>(
    () => messageLog.filter((m) => m.fromAgentId === agent.id),
    [messageLog, agent.id]
  )

  // Reset "clear" index when the selected agent changes — otherwise the next
  // agent would inherit a stale hidden offset from the previous one.
  useEffect(() => {
    setHiddenBeforeIdx(0)
  }, [agent.id])

  const visible = useMemo<MessageLog[]>(() => {
    const afterClear = agentEntries.slice(hiddenBeforeIdx)
    const afterFilter =
      filter === 'all' ? afterClear : afterClear.filter((m) => m.kind === filter)
    if (afterFilter.length <= MAX_LOCAL) return afterFilter
    return afterFilter.slice(afterFilter.length - MAX_LOCAL)
  }, [agentEntries, hiddenBeforeIdx, filter])

  const truncated = useMemo<number>(() => {
    const afterClear = agentEntries.length - hiddenBeforeIdx
    const afterFilterCount =
      filter === 'all'
        ? afterClear
        : agentEntries.slice(hiddenBeforeIdx).filter((m) => m.kind === filter).length
    return Math.max(0, afterFilterCount - MAX_LOCAL)
  }, [agentEntries, hiddenBeforeIdx, filter])

  // Autoscroll: after a new render, if not paused, pin to bottom. Using
  // useLayoutEffect so the scroll happens before paint — no flicker of
  // "just added a line but haven't scrolled yet".
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!paused) {
      el.scrollTop = el.scrollHeight
      prevScrollTopRef.current = el.scrollTop
    }
  }, [visible, paused])

  // Track user scroll. If they scroll UP from the pinned bottom, we pause.
  // If they scroll back to the bottom, we unpause. Using the scrollTop delta
  // against the previous value distinguishes "user dragged" from "content
  // grew and pushed scrollTop up", which would otherwise trigger a false
  // pause whenever layout changes.
  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom <= STICK_THRESHOLD_PX
    const delta = el.scrollTop - prevScrollTopRef.current
    prevScrollTopRef.current = el.scrollTop

    if (atBottom) {
      if (paused) setPaused(false)
      return
    }
    // Only flip to paused on a real upward gesture, not on a layout-induced
    // scrollTop increase.
    if (delta < 0 && !paused) setPaused(true)
  }

  const jumpToLatest = (): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    prevScrollTopRef.current = el.scrollTop
    setPaused(false)
  }

  // "Clear" is a local view reset — bumps the floor to the current unfiltered
  // length so everything present right now disappears, new entries keep
  // coming in. Store is untouched by design.
  const clearView = (): void => {
    setHiddenBeforeIdx(agentEntries.length)
  }

  const togglePause = (): void => {
    if (paused) {
      jumpToLatest()
    } else {
      setPaused(true)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* top bar: filters + controls */}
      <div className="flex flex-col gap-1.5 border-b border-border-soft bg-bg-1 px-3 py-2">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => {
            const active = filter === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  active
                    ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
                    : 'border-border-soft bg-bg-2 text-text-3 hover:border-border-mid hover:text-text-1'
                }`}
                aria-pressed={active}
              >
                {f}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePause}
            className="flex items-center gap-1 rounded-sm border border-border-soft bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-text-2 hover:border-border-mid hover:text-text-1"
            title={paused ? 'resume autoscroll' : 'pause autoscroll'}
          >
            {paused ? (
              <>
                <Play size={10} strokeWidth={1.75} />
                resume
              </>
            ) : (
              <>
                <Pause size={10} strokeWidth={1.75} />
                pause
              </>
            )}
          </button>
          <button
            type="button"
            onClick={clearView}
            className="flex items-center gap-1 rounded-sm border border-border-soft bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-text-2 hover:border-border-mid hover:text-text-1"
            title="clear view (local only)"
          >
            <Trash2 size={10} strokeWidth={1.75} />
            clear
          </button>
          <span className="ml-auto font-mono text-[10px] text-text-4">
            {visible.length}
            {paused ? ' · paused' : ''}
          </span>
        </div>
      </div>

      {/* terminal surface */}
      <div className="relative flex-1 min-h-0 bg-bg-1">
        {truncated > 0 && (
          <div className="absolute left-2 right-2 top-2 z-10 flex justify-center">
            <span className="rounded-sm border border-border-soft bg-bg-2/90 px-2 py-0.5 font-mono text-[10px] text-text-3 backdrop-blur">
              +{truncated} more (oldest truncated)
            </span>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto px-3 py-2 font-mono text-[11px] leading-snug text-text-2"
        >
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[11px] text-text-4">
              no activity yet
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((m) => (
                <li key={m.id}>
                  <div className="flex items-center gap-2 text-text-4">
                    <span className="tabular-nums">{formatTimestamp(m.at)}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${kindPillStyles(
                        m.kind
                      )}`}
                    >
                      <span aria-hidden>{kindGlyph(m.kind)}</span>
                      {m.kind}
                    </span>
                  </div>
                  <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-text-1">
                    {m.content}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>

        {paused && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 right-3 flex items-center gap-1 rounded-sm border border-accent-500/40 bg-accent-500/10 px-2 py-1 font-mono text-[10px] text-accent-400 shadow-sm hover:bg-accent-500/20"
            title="jump to latest"
          >
            <ArrowDownToLine size={10} strokeWidth={1.75} />
            jump to latest
          </button>
        )}
      </div>
    </div>
  )
}
