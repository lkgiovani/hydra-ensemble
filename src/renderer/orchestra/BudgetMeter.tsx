/**
 * BudgetMeter — ballpark token + cost counter derived from the live
 * MessageLog. No IPC, no new deps; pure reducer over the store so the
 * number moves in real time as messages stream in.
 *
 * Pricing and heuristics live in ./lib/budget. This component is just
 * the presentation layer + team/model resolution.
 */

import { useMemo } from 'react'
import { useOrchestra } from './state/orchestra'
import {
  formatCents,
  formatTokens,
  sumMessages
} from './lib/budget'

interface Props {
  /** When set, filters messages to this team. Defaults to the active team. */
  teamId?: string
  /** Which model to use for pricing. Defaults to the team's defaultModel. */
  modelOverride?: string
  /** Renders the one-line pill variant for the Team Overview bar. */
  compact?: boolean
}

/** Amber above $1, red above $5. Keeps the meter quiet during normal use
 *  and loud once a run starts burning real dollars. */
function tone(cents: number): {
  border: string
  text: string
  bg: string
} {
  if (cents > 500) {
    return {
      border: 'border-red-500/60',
      text: 'text-red-300',
      bg: 'bg-red-500/10'
    }
  }
  if (cents > 100) {
    return {
      border: 'border-amber-500/60',
      text: 'text-amber-300',
      bg: 'bg-amber-500/10'
    }
  }
  return {
    border: 'border-border-soft',
    text: 'text-text-2',
    bg: 'bg-bg-2/90'
  }
}

export default function BudgetMeter({
  teamId,
  modelOverride,
  compact
}: Props) {
  const activeTeamId = useOrchestra((s) => s.activeTeamId)
  const teams = useOrchestra((s) => s.teams)
  const messageLog = useOrchestra((s) => s.messageLog)

  const resolvedTeamId = teamId ?? activeTeamId ?? undefined
  const team = useMemo(
    () => (resolvedTeamId ? teams.find((t) => t.id === resolvedTeamId) : undefined),
    [teams, resolvedTeamId]
  )
  const model = modelOverride || team?.defaultModel || 'sonnet'

  const { messages, stats } = useMemo(() => {
    const filtered = resolvedTeamId
      ? messageLog.filter((m) => m.teamId === resolvedTeamId)
      : messageLog
    return { messages: filtered, stats: sumMessages(filtered, model) }
  }, [messageLog, resolvedTeamId, model])

  const t = tone(stats.cents)
  const totalTokens = stats.inputTokens + stats.outputTokens

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-sm border ${t.border} ${t.bg} px-1.5 py-0.5 text-[10px] ${t.text}`}
        title={`Budget · ${model} · in ${formatTokens(stats.inputTokens)} / out ${formatTokens(stats.outputTokens)} · ${messages.length} msgs`}
      >
        <span className="font-mono font-semibold">
          {formatCents(stats.cents)}
        </span>
        <span className="text-text-4">·</span>
        <span className="font-mono">{formatTokens(totalTokens)} tokens</span>
      </div>
    )
  }

  return (
    <div
      className={`flex w-[220px] flex-col gap-1 rounded-sm border ${t.border} ${t.bg} px-2.5 py-2 text-[11px] text-text-2 shadow-pop backdrop-blur-md`}
    >
      <div className="flex items-center justify-between">
        <span className="df-label text-[10px] uppercase tracking-wide text-text-4">
          Budget
        </span>
        <span className="font-mono text-[10px] text-text-3">{model}</span>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px]">
        <span className="text-text-4">
          in{' '}
          <span className="text-text-2">
            {formatTokens(stats.inputTokens)}
          </span>
        </span>
        <span className="text-text-4">
          out{' '}
          <span className="text-text-2">
            {formatTokens(stats.outputTokens)}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="df-label text-[10px] text-text-4">cost</span>
        <span className={`font-mono text-[12px] font-semibold ${t.text}`}>
          {formatCents(stats.cents)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="df-label text-[10px] text-text-4">messages</span>
        <span className="font-mono text-[11px] text-text-2">
          {messages.length}
        </span>
      </div>
    </div>
  )
}
