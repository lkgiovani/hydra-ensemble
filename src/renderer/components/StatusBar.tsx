import { useMemo } from 'react'
import { useSessions } from '../state/sessions'
import type { SessionMeta } from '../../shared/types'

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return `${count}`
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`
}

function activeBranch(active: SessionMeta | undefined): string {
  if (!active) return 'main'
  if (active.branch && active.branch.length > 0) return active.branch
  if (active.worktreePath) {
    const parts = active.worktreePath.split(/[\\/]/).filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) return last
  }
  return 'main'
}

export default function StatusBar() {
  const sessions = useSessions((s) => s.sessions)
  const activeId = useSessions((s) => s.activeId)

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId),
    [sessions, activeId]
  )

  const totals = useMemo(() => {
    let cost = 0
    let tokensIn = 0
    let tokensOut = 0
    for (const s of sessions) {
      cost += s.cost ?? 0
      tokensIn += s.tokensIn ?? 0
      tokensOut += s.tokensOut ?? 0
    }
    return { cost, tokensIn, tokensOut }
  }, [sessions])

  const branch = activeBranch(active)
  const model = active?.model ?? 'sonnet'
  const sessionCount = sessions.length

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-4 border-t border-white/10 bg-[#16161a] px-3 font-mono text-[11px] text-white/50"
      role="status"
    >
      <span className="flex items-center gap-1.5" title="current branch">
        <span aria-hidden>⎇</span>
        <span className="text-white/70">{branch}</span>
      </span>

      <span title="active sessions">
        <span className="tabular-nums text-white/70">{sessionCount}</span>{' '}
        <span className="text-white/40">
          {sessionCount === 1 ? 'session' : 'sessions'}
        </span>
      </span>

      <span className="ml-auto flex items-center gap-4">
        <span title="model">
          <span className="text-white/40">model </span>
          <span className="text-white/70">{model}</span>
        </span>

        <span title="aggregate input/output tokens" className="tabular-nums">
          <span className="text-white/70">{formatTokens(totals.tokensIn)}</span>
          <span className="text-white/40">↓ </span>
          <span className="text-white/70">{formatTokens(totals.tokensOut)}</span>
          <span className="text-white/40">↑</span>
        </span>

        <span
          title="aggregate cost across all sessions"
          className="tabular-nums text-white/80"
        >
          {formatCost(totals.cost)}
        </span>
      </span>
    </div>
  )
}
