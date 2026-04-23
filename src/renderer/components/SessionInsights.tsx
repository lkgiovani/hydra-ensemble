import { useMemo, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Copy,
  DollarSign,
  FileText,
  FolderOpen,
  History
} from 'lucide-react'
import { useSessions } from '../state/sessions'
import { useTranscripts } from '../state/transcripts'
import { useToasts } from '../state/toasts'
import type { SessionMeta, TranscriptMessage } from '../../shared/types'

/* ============================================================
 * Context-window sizing
 *
 * The JSONL stream reports a raw `model` string (e.g.
 * "claude-opus-4-7-20250101" or "claude-opus-4-7[1m]-20260101"). We map
 * that to an approximate total-context budget so the "context used"
 * bar can show a sensible percentage. These figures follow Anthropic's
 * public advertised context windows as of 2026-04.
 *
 * The `[1m]` / `1m` suffix means the 1M-token window variant — we key
 * off that explicitly so an opus-4-7 1m session doesn't look 5x fuller
 * than it actually is.
 *
 * Fallback: 200k (the conservative modern default across Claude models).
 * ============================================================ */
const MODEL_CONTEXT_WINDOWS: Array<{ match: RegExp; tokens: number; label: string }> = [
  // 1M-context variants — match FIRST so the "[1m]" suffix wins over the
  // plain family match below.
  { match: /\[?1m\]?/i, tokens: 1_000_000, label: '1M window' },
  // Opus — 200k on the standard tier
  { match: /opus/i, tokens: 200_000, label: 'opus 200K' },
  // Sonnet — 200k standard (1M variant caught by the rule above)
  { match: /sonnet/i, tokens: 200_000, label: 'sonnet 200K' },
  // Haiku — 200k
  { match: /haiku/i, tokens: 200_000, label: 'haiku 200K' },
  // GPT / other — generic fallback at 128k (most OpenAI chat models)
  { match: /gpt-4o|gpt-4\.1|gpt-4-turbo/i, tokens: 128_000, label: 'gpt 128K' }
]
const DEFAULT_CONTEXT_WINDOW = 200_000

function contextWindowFor(model: string | undefined): { tokens: number; label: string } {
  if (!model) return { tokens: DEFAULT_CONTEXT_WINDOW, label: 'default 200K' }
  for (const rule of MODEL_CONTEXT_WINDOWS) {
    if (rule.match.test(model)) return { tokens: rule.tokens, label: rule.label }
  }
  return { tokens: DEFAULT_CONTEXT_WINDOW, label: 'default 200K' }
}

/* ============================================================
 * Formatters (local — intentionally not importing from UsageMeter
 * since this panel is standalone and its output format differs
 * slightly: we show full-fat cost to 4dp, tokens with comma separators).
 * ============================================================ */
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1000
    return k < 10 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`
  }
  const m = n / 1_000_000
  return m < 10 ? `${m.toFixed(2)}M` : `${Math.round(m)}M`
}

function formatCost(n: number): string {
  if (n > 0 && n < 0.01) return '< $0.01'
  if (n < 1) return `$${n.toFixed(4)}`
  if (n < 100) return `$${n.toFixed(2)}`
  return `$${Math.round(n)}`
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

/* ============================================================
 * Context bar — coloured by tier
 *
 *   < 50%  green   — plenty of headroom
 *   < 80%  amber   — getting close, consider compacting
 *   >= 80% red     — compaction imminent
 * ============================================================ */
function contextTier(pct: number): { bar: string; text: string; label: string } {
  if (pct >= 80) {
    return { bar: 'bg-status-attention', text: 'text-status-attention', label: 'critical' }
  }
  if (pct >= 50) {
    return { bar: 'bg-status-thinking', text: 'text-status-thinking', label: 'warming up' }
  }
  return { bar: 'bg-status-generating', text: 'text-status-generating', label: 'healthy' }
}

interface SectionProps {
  id: string
  title: string
  icon: React.ReactNode
  right?: React.ReactNode
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}

function Section({ id, title, icon, right, open, onToggle, children }: SectionProps) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <section className="border-b border-border-soft">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-3"
        aria-expanded={open}
      >
        <Chevron size={12} strokeWidth={1.75} className="shrink-0 text-text-4" />
        <span className="shrink-0 text-text-3">{icon}</span>
        <span className="df-label grow">{title}</span>
        {right ? <span className="shrink-0 text-[10px] text-text-4">{right}</span> : null}
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </section>
  )
}

/* ============================================================
 * Activity derivation
 *
 * "messageLog-ish" items: flatten the transcript into a list of
 * user / assistant-text / tool_use events (most-recent first,
 * capped at 5). Each row shows a short title plus a subtitle
 * derived from the block. When no transcript is available we
 * fall back to a single row built from session.subStatus /
 * session.subTarget.
 * ============================================================ */
interface ActivityItem {
  key: string
  kind: 'user' | 'assistant' | 'tool' | 'live'
  title: string
  subtitle?: string
}

function buildActivity(
  messages: TranscriptMessage[] | undefined,
  session: SessionMeta | undefined
): ActivityItem[] {
  const out: ActivityItem[] = []
  if (messages && messages.length > 0) {
    // Walk in reverse so the newest events land at the top without
    // paying for an extra reverse() on big transcripts.
    for (let i = messages.length - 1; i >= 0 && out.length < 5; i--) {
      const msg = messages[i]
      if (!msg) continue
      // Prefer the last meaningful block in the message (tool_use wins
      // over text — tool calls are what the user usually wants to track).
      const toolBlock = [...msg.blocks].reverse().find((b) => b.kind === 'tool_use')
      const textBlock = [...msg.blocks].reverse().find((b) => b.kind === 'text')
      if (toolBlock && toolBlock.kind === 'tool_use') {
        const input = toolBlock.input as Record<string, unknown>
        const target =
          (input.file_path as string | undefined) ||
          (input.path as string | undefined) ||
          (input.command as string | undefined) ||
          (input.pattern as string | undefined) ||
          (input.query as string | undefined)
        out.push({
          key: `${msg.index}-${toolBlock.id}`,
          kind: 'tool',
          title: toolBlock.name,
          subtitle: target ? truncate(String(target), 60) : undefined
        })
        continue
      }
      if (textBlock && textBlock.kind === 'text') {
        const text = textBlock.text.trim()
        if (text.length === 0) continue
        out.push({
          key: `${msg.index}-${msg.role}`,
          kind: msg.role === 'user' ? 'user' : 'assistant',
          title: msg.role === 'user' ? 'user' : 'assistant',
          subtitle: truncate(text.replace(/\s+/g, ' '), 80)
        })
      }
    }
  }
  if (out.length === 0 && session?.subStatus) {
    out.push({
      key: 'live-sub',
      kind: 'live',
      title: session.subStatus,
      subtitle: session.subTarget ? truncate(session.subTarget, 60) : undefined
    })
  }
  return out
}

/* ============================================================
 * Trend sparkline — crude 2-point indicator drawn with CSS bars
 *
 * We don't have per-tick cost history in the store, so we synthesise
 * a "trend" from the ratio of output-tokens to input-tokens: when the
 * agent is mid-generation the ratio climbs and that's exactly when
 * cost is accelerating. This is a visual hint, not a precise chart.
 * ============================================================ */
function TrendLine({ tokensIn, tokensOut }: { tokensIn: number; tokensOut: number }) {
  // Project a normalised height per "phase" bucket. Early = mostly input,
  // later = output grows. Six columns so the line reads as a shape.
  const points = useMemo(() => {
    const total = tokensIn + tokensOut
    if (total === 0) return [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
    const outRatio = tokensOut / total
    // Smooth ramp: the sparkline climbs toward `outRatio` across 6 steps.
    return Array.from({ length: 6 }, (_, i) => {
      const t = (i + 1) / 6
      return Math.max(0.08, t * outRatio + 0.1)
    })
  }, [tokensIn, tokensOut])
  return (
    <div className="flex h-6 items-end gap-0.5" aria-hidden>
      {points.map((p, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm bg-accent-400/60"
          style={{ height: `${Math.round(p * 100)}%` }}
        />
      ))}
    </div>
  )
}

/* ============================================================
 * Main component
 * ============================================================ */
interface Props {
  sessionId: string
}

export default function SessionInsights({ sessionId }: Props) {
  const session = useSessions((s) => s.sessions.find((x) => x.id === sessionId))
  const transcriptEntry = useTranscripts((s) => s.byId[sessionId])
  const pushToast = useToasts((s) => s.push)

  // Per-section open state. Defaults mirror the spec ordering — context
  // and cost open (the main at-a-glance numbers), activity + quick links
  // folded to keep the panel compact on first render.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    context: true,
    cost: true,
    activity: false,
    links: false
  })
  const toggleSection = (id: string): void =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))

  const tokensIn = session?.tokensIn ?? 0
  const tokensOut = session?.tokensOut ?? 0
  const totalTokens = tokensIn + tokensOut
  const cost = session?.cost ?? 0
  const model = session?.model
  const { tokens: windowTokens, label: windowLabel } = contextWindowFor(model)
  const pct = windowTokens > 0 ? Math.min(100, (totalTokens / windowTokens) * 100) : 0
  const tier = contextTier(pct)

  const activity = useMemo(
    () => buildActivity(transcriptEntry?.messages, session),
    [transcriptEntry?.messages, session]
  )

  const copy = (value: string, label: string): void => {
    if (!navigator.clipboard) return
    void navigator.clipboard
      .writeText(value)
      .then(() =>
        pushToast({ kind: 'success', title: `${label} copied`, body: truncate(value, 80) })
      )
      .catch(() =>
        pushToast({ kind: 'error', title: `failed to copy ${label}` })
      )
  }

  /* ============================================================
   * No session — render a calm empty state instead of bailing to
   * `null`. The panel sits in a slide-pane slot that's always laid
   * out, so a silent null would leave weird background showing.
   * ============================================================ */
  if (!session) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-center bg-bg-2 p-6 text-center text-xs text-text-4">
        <FileText size={18} strokeWidth={1.5} className="mb-2 text-text-4" />
        <span>no active session</span>
      </aside>
    )
  }

  const worktreePath = session.worktreePath || session.cwd
  const jsonlPath = transcriptEntry?.path ?? null

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto bg-bg-2">
      {/* Header — session name and model tag. Keeps the panel anchored so
          users always know which session these stats belong to. */}
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border-soft bg-bg-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Activity size={13} strokeWidth={1.75} className="shrink-0 text-accent-400" />
          <span className="df-label truncate">{session.name}</span>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-text-4">{windowLabel}</span>
      </header>

      {/* -- Context ---------------------------------------------------- */}
      <Section
        id="context"
        title="context"
        icon={<FileText size={12} strokeWidth={1.75} />}
        right={
          <span className={tier.text}>
            {pct.toFixed(1)}% · {tier.label}
          </span>
        }
        open={!!openSections.context}
        onToggle={toggleSection}
      >
        <div className="space-y-2">
          {/* Bar — fixed-height track + filled bar. Width is the raw
              percentage so the colour tier and width stay in sync. */}
          <div
            className="h-2 w-full overflow-hidden rounded-sm bg-bg-4"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label="context window used"
          >
            <div
              className={`h-full transition-all duration-300 ${tier.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[11px] text-text-3">
            <span>
              {formatTokens(totalTokens)} / {formatTokens(windowTokens)}
            </span>
            <span className="text-text-4">
              in {formatTokens(tokensIn)} · out {formatTokens(tokensOut)}
            </span>
          </div>
        </div>
      </Section>

      {/* -- Cost ------------------------------------------------------- */}
      <Section
        id="cost"
        title="cost"
        icon={<DollarSign size={12} strokeWidth={1.75} />}
        open={!!openSections.cost}
        onToggle={toggleSection}
      >
        <div className="flex items-end justify-between gap-4">
          <div className="font-display text-3xl font-semibold text-text-1">
            {formatCost(cost)}
          </div>
          <TrendLine tokensIn={tokensIn} tokensOut={tokensOut} />
        </div>
        <div className="mt-1 font-mono text-[10px] text-text-4">
          {model ? model : 'model unknown'}
        </div>
      </Section>

      {/* -- Activity --------------------------------------------------- */}
      <Section
        id="activity"
        title="activity"
        icon={<History size={12} strokeWidth={1.75} />}
        right={<span>{activity.length}/5</span>}
        open={!!openSections.activity}
        onToggle={toggleSection}
      >
        {activity.length === 0 ? (
          <div className="py-1 text-[11px] text-text-4">no recent activity</div>
        ) : (
          <ul className="space-y-1.5">
            {activity.map((item) => (
              <li
                key={item.key}
                className="rounded-sm border border-border-soft bg-bg-1 px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.kind === 'tool'
                        ? 'bg-status-editing'
                        : item.kind === 'user'
                          ? 'bg-status-input'
                          : item.kind === 'assistant'
                            ? 'bg-accent-400'
                            : 'bg-status-thinking'
                    }`}
                  />
                  <span className="truncate text-[11px] text-text-2">{item.title}</span>
                </div>
                {item.subtitle ? (
                  <div className="ml-3 truncate font-mono text-[10px] text-text-4">
                    {item.subtitle}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* -- Quick links ------------------------------------------------ */}
      <Section
        id="links"
        title="quick links"
        icon={<FolderOpen size={12} strokeWidth={1.75} />}
        open={!!openSections.links}
        onToggle={toggleSection}
      >
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => copy(worktreePath, 'worktree path')}
            className="flex items-center gap-2 rounded-sm border border-border-soft bg-bg-1 px-2 py-1.5 text-left text-[11px] text-text-2 hover:border-border-mid hover:text-text-1"
            title={worktreePath}
          >
            <FolderOpen size={12} strokeWidth={1.75} className="shrink-0 text-text-3" />
            <span className="truncate">open worktree in editor</span>
          </button>
          <button
            type="button"
            onClick={() =>
              jsonlPath
                ? copy(jsonlPath, 'JSONL path')
                : pushToast({
                    kind: 'warning',
                    title: 'transcript not loaded yet',
                    body: 'open the visual view once to populate the JSONL path.'
                  })
            }
            className="flex items-center gap-2 rounded-sm border border-border-soft bg-bg-1 px-2 py-1.5 text-left text-[11px] text-text-2 hover:border-border-mid hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-60"
            title={jsonlPath ?? 'no JSONL path yet'}
          >
            <FileText size={12} strokeWidth={1.75} className="shrink-0 text-text-3" />
            <span className="truncate">open JSONL</span>
          </button>
          <button
            type="button"
            onClick={() => copy(session.id, 'session id')}
            className="flex items-center gap-2 rounded-sm border border-border-soft bg-bg-1 px-2 py-1.5 text-left text-[11px] text-text-2 hover:border-border-mid hover:text-text-1"
            title={session.id}
          >
            <Copy size={12} strokeWidth={1.75} className="shrink-0 text-text-3" />
            <span className="truncate">copy session id</span>
          </button>
        </div>
      </Section>
    </aside>
  )
}
