/**
 * TaskChip — tiny floating card that animates along a route path.
 *
 * Rendered by Canvas as an absolutely-positioned overlay on top of the
 * react-flow surface when a task is in flight (status `routing` →
 * `in_progress`). Parent owns placement; this component only knows how to
 * walk `routePath` at 300ms per segment and call `onArrive` once the last
 * point is reached (PRD.md §10 F5).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Priority, Task } from '../../shared/orchestra'

/** Point along the flight path, in the same coordinate space the parent uses. */
export interface ChipPoint {
  x: number
  y: number
}

interface Props {
  task: Task
  routePath: ChipPoint[]
  onArrive: () => void
}

/** 300ms per segment is the "hop cadence" specified in PRD F5. */
const HOP_DURATION_MS = 300

const PRIORITY_STYLE: Record<Priority, string> = {
  P0: 'border-red-500/70 bg-red-500/20 text-red-200',
  P1: 'border-amber-500/70 bg-amber-500/20 text-amber-200',
  P2: 'border-sky-500/60 bg-sky-500/15 text-sky-200',
  P3: 'border-border-mid bg-bg-3 text-text-2'
}

export default function TaskChip({ task, routePath, onArrive }: Props) {
  // Defensive: an empty route means the parent rendered us prematurely.
  // Don't paint anything — and skip onArrive to avoid a stuck-task race
  // where the caller keeps thinking it's flying.
  const hasPath = routePath.length > 0

  // Current segment index. 0 means "sitting at routePath[0]", segment N
  // means "animating from [N-1] to [N]".
  const [segment, setSegment] = useState(0)
  const arrivedRef = useRef(false)

  // Reset when the path identity changes (new task or re-route).
  useEffect(() => {
    setSegment(0)
    arrivedRef.current = false
  }, [routePath])

  // Step-by-step walk. We schedule the next hop inside useEffect so the
  // transform transition for the prior hop has time to settle before the
  // next translate is committed — otherwise React batches both writes and
  // the browser skips the intermediate frame.
  useEffect(() => {
    if (!hasPath) return
    if (segment >= routePath.length - 1) {
      if (!arrivedRef.current) {
        arrivedRef.current = true
        // Let the last transition paint fully before announcing arrival.
        const t = window.setTimeout(onArrive, HOP_DURATION_MS)
        return () => window.clearTimeout(t)
      }
      return
    }
    const t = window.setTimeout(() => setSegment((s) => s + 1), HOP_DURATION_MS)
    return () => window.clearTimeout(t)
  }, [segment, routePath.length, hasPath, onArrive])

  // Clamp the read index — React can render between a `routePath` prop
  // swap and our reset effect, leaving `segment` briefly out of bounds.
  const safeIdx = useMemo(() => {
    if (!hasPath) return 0
    return Math.min(segment, routePath.length - 1)
  }, [segment, routePath.length, hasPath])

  const current = routePath[safeIdx]
  if (!current) return null

  // `scale` lifts the card slightly at the first and last points so it
  // feels like it pops out of the task bar and lands on the agent card.
  const isBookend = safeIdx === 0 || safeIdx === routePath.length - 1
  const scale = isBookend ? 0.92 : 1

  const style: CSSProperties = {
    transform: `translate3d(${current.x}px, ${current.y}px, 0) translate(-50%, -50%) scale(${scale})`,
    transition: `transform ${HOP_DURATION_MS}ms cubic-bezier(0.4, 0.0, 0.2, 1)`,
    willChange: 'transform'
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Task ${task.title} routing`}
      className="pointer-events-none absolute left-0 top-0 z-20 flex max-w-[260px] items-center gap-2 rounded-md border border-accent-500/60 bg-bg-2/95 px-2 py-1.5 font-mono text-[11px] text-text-1 shadow-[0_0_0_1px_var(--color-border-mid)_inset,0_6px_20px_rgba(0,0,0,0.55)] backdrop-blur"
      style={style}
      data-task-id={task.id}
    >
      <span
        className={`shrink-0 rounded-sm border px-1 py-[1px] text-[9px] font-semibold tracking-wider ${PRIORITY_STYLE[task.priority]}`}
        aria-label={`Priority ${task.priority}`}
      >
        {task.priority}
      </span>
      <span className="truncate text-[11px] text-text-1" title={task.title}>
        {task.title}
      </span>
    </div>
  )
}
