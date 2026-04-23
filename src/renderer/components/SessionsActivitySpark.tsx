import { useEffect, useRef, useState } from 'react'
import { useSessions } from '../state/sessions'
import type { SessionState } from '../../shared/types'

interface Props {
  buckets?: number
  tickMs?: number
}

type BucketKey = SessionState | 'empty'

interface Bucket {
  at: number
  counts: Record<SessionState, number>
  dominant: BucketKey
}

const STATE_COLOR: Record<BucketKey, string> = {
  empty: 'var(--color-bg-3, #2a2a2a)',
  idle: 'var(--color-status-idle, #5e6070)',
  generating: 'var(--color-status-input, #4ea5ff)',
  userInput: 'var(--color-status-thinking, #ffb829)',
  needsAttention: 'var(--color-status-attention, #ff4d5d)',
  thinking: 'var(--color-accent-500, #ff6b4d)'
}

const STATE_LABEL: Record<BucketKey, string> = {
  empty: 'empty',
  idle: 'idle',
  generating: 'running',
  userInput: 'paused',
  needsAttention: 'error',
  thinking: 'thinking'
}

const ORDER: SessionState[] = [
  'thinking',
  'needsAttention',
  'generating',
  'userInput',
  'idle'
]

function emptyCounts(): Record<SessionState, number> {
  return {
    idle: 0,
    thinking: 0,
    generating: 0,
    userInput: 0,
    needsAttention: 0
  }
}

function computeDominant(counts: Record<SessionState, number>): BucketKey {
  let best: BucketKey = 'empty'
  let bestCount = 0
  for (const s of ORDER) {
    const n = counts[s]
    if (n > bestCount) {
      best = s
      bestCount = n
    }
  }
  return best
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function SessionsActivitySpark({
  buckets = 30,
  tickMs = 5000
}: Props) {
  const sessions = useSessions((s) => s.sessions)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  const ringRef = useRef<Bucket[]>([])
  const [, setVersion] = useState(0)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    // Seed the ring with empty buckets so the bar has a stable shape.
    if (ringRef.current.length === 0) {
      const now = Date.now()
      ringRef.current = Array.from({ length: buckets }, (_, i) => ({
        at: now - (buckets - 1 - i) * tickMs,
        counts: emptyCounts(),
        dominant: 'empty' as BucketKey
      }))
    }

    const tick = () => {
      const now = Date.now()
      const counts = emptyCounts()
      for (const s of sessionsRef.current) {
        if (s.state) counts[s.state] += 1
      }
      const bucket: Bucket = {
        at: now,
        counts,
        dominant: computeDominant(counts)
      }
      const next = ringRef.current.slice(1)
      next.push(bucket)
      // Keep exactly `buckets` entries even if the prop changed.
      while (next.length > buckets) next.shift()
      while (next.length < buckets) {
        next.unshift({
          at: now - (buckets - next.length) * tickMs,
          counts: emptyCounts(),
          dominant: 'empty'
        })
      }
      ringRef.current = next
      setVersion((v) => v + 1)
    }

    tick()
    const id = window.setInterval(tick, tickMs)
    return () => window.clearInterval(id)
  }, [buckets, tickMs])

  const segW = Math.max(1, Math.floor(220 / buckets))
  const totalWidth = 220

  const tooltip = (() => {
    if (hoverIdx === null) return null
    const b = ringRef.current[hoverIdx]
    if (!b) return null
    return b
  })()

  return (
    <div
      className="flex items-center gap-2"
      title="Sessions activity — last 5 minutes"
      aria-label="Sessions activity sparkline"
    >
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-text-4">
        last 5m
      </span>
      <div className="relative">
        <div
          className="flex items-stretch overflow-hidden rounded-sm border border-border-soft bg-bg-2"
          style={{ width: totalWidth, height: 12 }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {ringRef.current.map((b, i) => (
            <div
              key={i}
              onMouseEnter={() => setHoverIdx(i)}
              style={{
                width: segW,
                height: 8,
                marginTop: 2,
                marginBottom: 2,
                marginRight: i === ringRef.current.length - 1 ? 0 : 1,
                backgroundColor: STATE_COLOR[b.dominant],
                opacity: b.dominant === 'empty' ? 0.4 : 0.95
              }}
              aria-label={`${formatTime(b.at)} — ${STATE_LABEL[b.dominant]}`}
            />
          ))}
        </div>
        {tooltip && (
          <div
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border-soft bg-bg-1 px-2 py-1 font-mono text-[10px] text-text-2 shadow-sm"
            role="tooltip"
          >
            <div className="mb-0.5 text-text-3">{formatTime(tooltip.at)}</div>
            {ORDER.map((s) => {
              const n = tooltip.counts[s]
              if (n === 0) return null
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: STATE_COLOR[s] }}
                    aria-hidden
                  />
                  <span className="lowercase">{STATE_LABEL[s]}</span>
                  <span className="ml-auto tabular-nums text-text-3">{n}</span>
                </div>
              )
            })}
            {tooltip.dominant === 'empty' && (
              <div className="text-text-4">no sessions</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
