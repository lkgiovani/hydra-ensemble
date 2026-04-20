import { useMemo, useState } from 'react'

interface Props {
  diff: string
  /** When true, fills the parent container instead of capping height. */
  fill?: boolean
  emptyLabel?: string
}

/** Hard ceiling on rendered lines per pass. A single huge diff (think
 *  package-lock.json) with 20k+ lines turns into 20k DOM nodes otherwise
 *  and locks up the renderer. Users can opt in to seeing the rest. */
const LINE_BUDGET = 4000

type Row =
  | { kind: 'header'; text: string }
  | { kind: 'hunk'; text: string; oldStart: number; newStart: number }
  | { kind: 'context'; oldLine: number; newLine: number; text: string }
  | { kind: 'add'; newLine: number; text: string }
  | { kind: 'del'; oldLine: number; text: string }
  | { kind: 'meta'; text: string }

/**
 * Parse a unified diff into a row stream with explicit old/new line
 * numbers per row. Keeps hunk headers as their own row so the renderer
 * can show them inline as a separator strip, like VS Code does.
 */
function parse(diff: string): Row[] {
  const lines = diff.split('\n')
  const rows: Row[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    // New hunk — reset counters from the @@ header.
    if (line.startsWith('@@')) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (match && match[1] && match[2]) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      rows.push({ kind: 'hunk', text: line, oldStart: oldLine, newStart: newLine })
      continue
    }

    // File header lines — 'diff --git', 'index', 'new file mode', etc.
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('rename ') ||
      line.startsWith('similarity ') ||
      line.startsWith('Binary files')
    ) {
      rows.push({ kind: 'header', text: line })
      continue
    }

    // ---/+++ headers (file names on each side of the diff).
    if (line.startsWith('---') || line.startsWith('+++')) {
      rows.push({ kind: 'meta', text: line })
      continue
    }

    // Diff body lines.
    if (line.startsWith('+')) {
      rows.push({ kind: 'add', newLine, text: line.slice(1) })
      newLine++
      continue
    }
    if (line.startsWith('-')) {
      rows.push({ kind: 'del', oldLine, text: line.slice(1) })
      oldLine++
      continue
    }
    if (line.startsWith('\\')) {
      // "\ No newline at end of file" — render as meta.
      rows.push({ kind: 'meta', text: line })
      continue
    }

    // Context line (may start with a space or be totally empty).
    const text = line.startsWith(' ') ? line.slice(1) : line
    rows.push({ kind: 'context', oldLine, newLine, text })
    oldLine++
    newLine++
  }
  return rows
}

/**
 * VS Code-style unified diff renderer. Two gutter columns for the old and
 * new line numbers, a sign column, and the content. Added rows get a
 * green wash, deleted rows a red wash, hunks are an orange strip. The
 * whole thing is monospace with tabular line numbers so nothing jitters.
 */
export default function DiffView({ diff, fill = false, emptyLabel = 'no changes' }: Props) {
  const rows = useMemo(() => parse(diff), [diff])
  const [showAll, setShowAll] = useState(false)

  if (diff.trim().length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-text-4">
        {emptyLabel}
      </div>
    )
  }

  const truncated = !showAll && rows.length > LINE_BUDGET
  const visible = truncated ? rows.slice(0, LINE_BUDGET) : rows

  return (
    <div
      className={`flex ${fill ? 'h-full' : ''} flex-col overflow-hidden rounded-md border border-border-soft bg-bg-1`}
    >
      <div className={`df-scroll flex-1 overflow-auto font-mono text-[12.5px] leading-[1.55] ${fill ? '' : 'max-h-[70vh]'}`}>
        <table className="w-full border-collapse">
          <colgroup>
            <col className="w-12" />
            <col className="w-12" />
            <col className="w-5" />
            <col />
          </colgroup>
          <tbody>
            {visible.map((row, i) => {
              if (row.kind === 'header') {
                return (
                  <tr key={i} className="bg-bg-2 text-accent-400">
                    <td colSpan={4} className="whitespace-pre px-3 py-0.5 text-[11px]">
                      {row.text}
                    </td>
                  </tr>
                )
              }
              if (row.kind === 'meta') {
                return (
                  <tr key={i} className="text-text-3">
                    <td colSpan={4} className="whitespace-pre px-3 py-0.5 text-[11px]">
                      {row.text}
                    </td>
                  </tr>
                )
              }
              if (row.kind === 'hunk') {
                return (
                  <tr
                    key={i}
                    className="border-y border-status-thinking/20 bg-status-thinking/10 text-status-thinking"
                  >
                    <td colSpan={4} className="whitespace-pre px-3 py-1 text-[11px]">
                      {row.text}
                    </td>
                  </tr>
                )
              }
              const sign =
                row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '
              const rowCls =
                row.kind === 'add'
                  ? 'bg-status-generating/[0.10] text-text-1'
                  : row.kind === 'del'
                    ? 'bg-status-attention/[0.10] text-text-1'
                    : 'text-text-2'
              const gutterCls =
                row.kind === 'add'
                  ? 'bg-status-generating/[0.15] text-status-generating/80'
                  : row.kind === 'del'
                    ? 'bg-status-attention/[0.15] text-status-attention/80'
                    : 'bg-bg-2/60 text-text-4'
              const signCls =
                row.kind === 'add'
                  ? 'bg-status-generating/[0.15] text-status-generating'
                  : row.kind === 'del'
                    ? 'bg-status-attention/[0.15] text-status-attention'
                    : 'bg-bg-2/60 text-text-4'
              const oldCell =
                row.kind === 'add' ? '' : String((row as { oldLine: number }).oldLine)
              const newCell =
                row.kind === 'del' ? '' : String((row as { newLine: number }).newLine)
              return (
                <tr key={i} className={rowCls}>
                  <td
                    className={`select-none whitespace-pre px-2 text-right text-[11px] tabular-nums ${gutterCls}`}
                  >
                    {oldCell}
                  </td>
                  <td
                    className={`select-none whitespace-pre px-2 text-right text-[11px] tabular-nums ${gutterCls}`}
                  >
                    {newCell}
                  </td>
                  <td className={`select-none whitespace-pre text-center ${signCls}`}>{sign}</td>
                  <td className="whitespace-pre px-3">{row.text || ' '}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {truncated ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="shrink-0 border-t border-border-soft bg-bg-2 px-3 py-1.5 text-left font-mono text-[10.5px] text-text-3 hover:bg-bg-3 hover:text-text-1"
          title="Show the remaining lines"
        >
          {rows.length - LINE_BUDGET} more line{rows.length - LINE_BUDGET === 1 ? '' : 's'}{' '}
          hidden — click to expand
        </button>
      ) : null}
    </div>
  )
}
