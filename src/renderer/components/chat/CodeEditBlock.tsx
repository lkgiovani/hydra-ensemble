import { useMemo, useState } from 'react'
import { Copy, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  filePath: string
  oldContent?: string
  newContent?: string
  language?: string
  compact?: boolean
}

type DiffLine =
  | { kind: 'ctx'; text: string }
  | { kind: 'add'; text: string }
  | { kind: 'del'; text: string }

/**
 * Greedy LCS-ish line diff: compute longest common subsequence of line
 * arrays with a DP table, then walk it backwards emitting `ctx` for
 * matches and `del`/`add` for the diverging ranges. Small inputs only —
 * O(n*m) is fine for chat-sized hunks.
 */
function diffLines(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.length === 0 ? [] : oldStr.split('\n')
  const b = newStr.length === 0 ? [] : newStr.split('\n')
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'ctx', text: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: 'del', text: a[i]! })
      i++
    } else {
      out.push({ kind: 'add', text: b[j]! })
      j++
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++]! })
  while (j < m) out.push({ kind: 'add', text: b[j++]! })
  return out
}

/** Truncate-left so the filename (rightmost segment) stays visible. */
function truncateLeft(s: string, max: number): string {
  if (s.length <= max) return s
  return '…' + s.slice(s.length - max + 1)
}

/**
 * Inline diff hunk for chat. Shows a GitHub-style header with file
 * path, +/- counts and [Copy] / [Open] actions, and a mono body with
 * per-line gutter markers. Click the header to collapse/expand.
 */
export default function CodeEditBlock(props: Props) {
  const { filePath, oldContent = '', newContent = '', language, compact = false } = props
  const [expanded, setExpanded] = useState(!compact)
  const [copied, setCopied] = useState(false)

  const lines = useMemo(() => diffLines(oldContent, newContent), [oldContent, newContent])
  const adds = lines.filter((l) => l.kind === 'add').length
  const dels = lines.filter((l) => l.kind === 'del').length

  const onCopy = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(newContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard may be blocked — no-op. */
    }
  }

  const onOpen = (e: React.MouseEvent): void => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('editor:open-path', { detail: { path: filePath } }))
  }

  return (
    <div
      className="overflow-hidden border border-border-soft bg-bg-2"
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-bg-3"
      >
        {expanded ? (
          <ChevronDown size={12} strokeWidth={1.75} className="shrink-0 text-text-3" />
        ) : (
          <ChevronRight size={12} strokeWidth={1.75} className="shrink-0 text-text-3" />
        )}
        <span
          className="min-w-0 flex-1 truncate font-mono text-text-2"
          dir="rtl"
          title={filePath}
        >
          {truncateLeft(filePath, 80)}
        </span>
        {language ? (
          <span className="shrink-0 font-mono text-[10px] uppercase text-text-4">{language}</span>
        ) : null}
        <span className="shrink-0 font-mono text-[11px] font-semibold text-status-success">
          +{adds}
        </span>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-status-attention">
          −{dels}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={onCopy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onCopy(e as unknown as React.MouseEvent)
          }}
          className="shrink-0 rounded-sm p-1 text-text-4 transition hover:bg-bg-3 hover:text-text-1"
          title={copied ? 'copied' : 'copy new content'}
        >
          <Copy size={11} strokeWidth={1.75} />
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onOpen(e as unknown as React.MouseEvent)
          }}
          className="shrink-0 rounded-sm p-1 text-text-4 transition hover:bg-bg-3 hover:text-text-1"
          title={`open ${filePath}`}
        >
          <ExternalLink size={11} strokeWidth={1.75} />
        </span>
      </button>
      {expanded && lines.length > 0 ? (
        <pre className="df-scroll max-h-96 overflow-auto border-t border-border-soft bg-bg-1 font-mono text-[11px] leading-relaxed text-text-2">
          {lines.map((l, idx) => {
            const bg =
              l.kind === 'add'
                ? 'bg-status-success/10 text-text-1'
                : l.kind === 'del'
                  ? 'bg-status-attention/10 text-text-1'
                  : ''
            const marker = l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '
            const markerColor =
              l.kind === 'add'
                ? 'text-status-success'
                : l.kind === 'del'
                  ? 'text-status-attention'
                  : 'text-text-4'
            return (
              <div key={idx} className={`flex ${bg}`}>
                <span
                  className={`w-6 shrink-0 select-none border-r border-border-soft px-2 text-right ${markerColor}`}
                >
                  {marker}
                </span>
                <span className="whitespace-pre-wrap break-all px-2">{l.text}</span>
              </div>
            )
          })}
        </pre>
      ) : null}
    </div>
  )
}
