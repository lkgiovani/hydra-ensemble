import { useState } from 'react'
import { Bot, ArrowUpToLine, ArrowDownToLine, DollarSign } from 'lucide-react'
import { useSessions } from '../state/sessions'

interface Props {
  sessionId: string
  compact?: boolean
}

/**
 * Formats token counts into a short human string.
 *   999      -> "999"
 *   1_234    -> "1.2k"
 *   1_200_000 -> "1.2M"
 */
function formatTokens(n: number | undefined): string {
  const value = n ?? 0
  if (value < 1000) return String(value)
  if (value < 1_000_000) {
    const k = value / 1000
    // One decimal for sub-10k, drop it above to keep the pill tight.
    return k < 10 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`
  }
  const m = value / 1_000_000
  return m < 10 ? `${m.toFixed(1)}M` : `${Math.round(m)}M`
}

/**
 * Cost formatter:
 *   < 0.01     -> "< $0.01"  (tiny, don't show $0.00 — it's misleading)
 *   otherwise  -> "$1.23"    (two decimals)
 */
function formatCost(n: number | undefined): string {
  const value = n ?? 0
  if (value > 0 && value < 0.01) return '< $0.01'
  return `$${value.toFixed(2)}`
}

/**
 * Derives a short, humane model label from the raw model string reported
 * in the JSONL stream. Examples:
 *   "claude-opus-4-7-20250101"  -> "opus 4.7"
 *   "claude-sonnet-4-6"         -> "sonnet 4.6"
 *   "claude-haiku-4-5"          -> "haiku 4.5"
 *   "gpt-4o-mini"               -> "gpt-4o-mini"  (fallback: raw)
 */
function shortModel(model: string | undefined): string {
  if (!model) return 'model'
  const m = model.toLowerCase()
  const family = m.includes('opus')
    ? 'opus'
    : m.includes('sonnet')
      ? 'sonnet'
      : m.includes('haiku')
        ? 'haiku'
        : null
  if (!family) return model
  // First "<digit>-<digit>" group — "4-7" / "4-6" / "4-5". Anything after
  // that (date stamp, 1m suffix) is noise for a header badge.
  const versionMatch = m.match(/(\d+)-(\d+)/)
  if (!versionMatch) return family
  return `${family} ${versionMatch[1]}.${versionMatch[2]}`
}

/**
 * Picks a text colour for the cost label based on magnitude.
 * Amber past $1, red past $5. Nothing below that — avoids visual noise
 * for sessions that have barely spent anything.
 */
function costColor(cost: number | undefined): string {
  const value = cost ?? 0
  if (value > 5) return 'text-red-400'
  if (value > 1) return 'text-amber-400'
  return 'text-text-2'
}

export default function UsageMeter({ sessionId, compact }: Props) {
  // Select the single session record — the store updates on every JSONL
  // patch, so this re-renders as cost/tokens tick up without any extra
  // wiring.
  const session = useSessions((s) => s.sessions.find((x) => x.id === sessionId))
  const [confirming, setConfirming] = useState(false)

  if (!session) return null

  const cost = session.cost
  const tokensIn = session.tokensIn
  const tokensOut = session.tokensOut
  const model = session.model

  const costCls = costColor(cost)
  const totalTokens = (tokensIn ?? 0) + (tokensOut ?? 0)

  // Detailed tooltip with the raw numbers — the pill rounds aggressively,
  // so anyone who cares about the exact figure hovers.
  const tooltip = [
    `model: ${model ?? 'unknown'}`,
    `tokens in: ${(tokensIn ?? 0).toLocaleString()}`,
    `tokens out: ${(tokensOut ?? 0).toLocaleString()}`,
    `cost: $${(cost ?? 0).toFixed(4)}`
  ].join('\n')

  const handleCostClick = (): void => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    // TODO: wire this up once the backend exposes a "reset usage" IPC
    // endpoint — right now the main-side JSONL parser owns the running
    // totals and there's no knob to zero them.
    // eslint-disable-next-line no-console
    console.log('[UsageMeter] reset requested for session', sessionId, '— not implemented')
    setConfirming(false)
  }

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-text-2"
        title={tooltip}
      >
        <button
          type="button"
          onClick={handleCostClick}
          className={`inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-bg-3 ${costCls}`}
          aria-label="session cost"
        >
          <DollarSign size={11} strokeWidth={1.75} aria-hidden />
          <span>{formatCost(cost)}</span>
        </button>
        <span className="text-text-4">·</span>
        <span>{formatTokens(totalTokens)} tok</span>
        {confirming ? (
          <span className="text-text-4">(reset? click again)</span>
        ) : null}
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-3 font-mono text-[11px] text-text-2"
      title={tooltip}
    >
      <span className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-bg-3 px-1.5 py-0.5 text-[10px] text-text-2">
        <Bot size={11} strokeWidth={1.75} aria-hidden />
        <span className="lowercase">{shortModel(model)}</span>
      </span>

      <span className="inline-flex items-center gap-1">
        <ArrowUpToLine size={11} strokeWidth={1.75} className="text-text-4" aria-hidden />
        <span className="text-text-4">in</span>
        <span>{formatTokens(tokensIn)}</span>
      </span>

      <span className="inline-flex items-center gap-1">
        <ArrowDownToLine size={11} strokeWidth={1.75} className="text-text-4" aria-hidden />
        <span className="text-text-4">out</span>
        <span>{formatTokens(tokensOut)}</span>
      </span>

      <button
        type="button"
        onClick={handleCostClick}
        className={`inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-bg-3 ${costCls}`}
        aria-label="session cost"
      >
        <DollarSign size={11} strokeWidth={1.75} aria-hidden />
        <span>{formatCost(cost)}</span>
      </button>
      {confirming ? (
        <span className="text-text-4">reset? click again</span>
      ) : null}
    </span>
  )
}
