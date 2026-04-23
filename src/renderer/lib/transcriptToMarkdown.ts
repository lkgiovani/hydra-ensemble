/**
 * Converts a parsed session transcript (as returned by `useTranscripts` /
 * the `session.readTranscript` IPC) into clean, copy-pasteable Markdown.
 *
 * Pure function — no React, no DOM, no I/O. Safe to call on any thread /
 * inside a web worker / during export.
 */

import type {
  TranscriptBlock,
  TranscriptMessage,
  TranscriptPayload,
} from '../../shared/types'

export interface TranscriptToMarkdownOptions {
  /** Include `thinking` blocks from the assistant. Default: false. */
  includeThinking?: boolean
  /** Include `tool_use` + `tool_result` blocks as fenced code. Default: true. */
  includeToolBlocks?: boolean
}

/**
 * Tiny inline date formatter — avoids pulling in date-fns / dayjs just for
 * a header line. Returns an ISO-ish `YYYY-MM-DD HH:mm:ss` in local time,
 * or an empty string for missing / unparseable input.
 */
const formatTimestamp = (ts: string | undefined): string => {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

/**
 * Role → header label. `system` messages are kept verbatim so exported
 * transcripts stay faithful to what the parser saw.
 */
const roleLabel = (role: TranscriptMessage['role']): string => {
  switch (role) {
    case 'user':
      return 'User'
    case 'assistant':
      return 'Assistant'
    case 'system':
      return 'System'
    default:
      return 'Message'
  }
}

/**
 * Stringify arbitrary tool input as pretty JSON. Falls back to `String(...)`
 * if the value contains a cycle or otherwise resists `JSON.stringify`.
 */
const stringifyInput = (input: Record<string, unknown>): string => {
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

/**
 * Prefix every non-empty line with `> ` so tool-result text renders as a
 * blockquote. Empty lines stay empty so paragraphs survive the transform.
 */
const blockquote = (text: string): string =>
  text
    .split('\n')
    .map((line) => (line.length === 0 ? '>' : `> ${line}`))
    .join('\n')

/**
 * Render a single block. Returns `null` when the block is filtered out by
 * the current options so callers can drop empty separators cleanly.
 */
const renderBlock = (
  block: TranscriptBlock,
  opts: Required<TranscriptToMarkdownOptions>,
): string | null => {
  switch (block.kind) {
    case 'text':
      return block.text.trim().length === 0 ? null : block.text.trim()

    case 'thinking':
      if (!opts.includeThinking) return null
      return [
        '<details>',
        '<summary>thinking</summary>',
        '',
        block.text.trim(),
        '',
        '</details>',
      ].join('\n')

    case 'tool_use': {
      if (!opts.includeToolBlocks) return null
      const body = stringifyInput(block.input)
      return [`### Tool: ${block.name}`, '```json', body, '```'].join('\n')
    }

    case 'tool_result': {
      if (!opts.includeToolBlocks) return null
      const text = block.text.trim()
      const header = block.isError ? 'Result (error):' : 'Result:'
      if (text.length === 0) return header
      return [header, blockquote(text)].join('\n')
    }

    default:
      return null
  }
}

/**
 * Render the header for a single message — e.g. `## Assistant · 2026-04-22
 * 10:00:00 · claude-opus-4-7`. Model and timestamp are optional and collapse
 * cleanly when absent.
 */
const renderHeader = (msg: TranscriptMessage): string => {
  const parts: string[] = [roleLabel(msg.role)]
  const ts = formatTimestamp(msg.timestamp)
  if (ts) parts.push(ts)
  if (msg.role === 'assistant' && msg.model) parts.push(msg.model)
  return `## ${parts.join(' · ')}`
}

/**
 * Render a single transcript message, respecting the block filters. Returns
 * `null` if the message would be empty after filtering (e.g. an assistant
 * turn that was purely `thinking` with `includeThinking: false`).
 */
const renderMessage = (
  msg: TranscriptMessage,
  opts: Required<TranscriptToMarkdownOptions>,
): string | null => {
  const rendered = msg.blocks
    .map((b) => renderBlock(b, opts))
    .filter((s): s is string => s !== null && s.length > 0)

  if (rendered.length === 0) return null

  return [renderHeader(msg), '', rendered.join('\n\n')].join('\n')
}

/**
 * Convert a full `TranscriptPayload` to Markdown.
 *
 * Messages are separated by a blank line so the output can be dropped
 * straight into a `.md` file, a clipboard, or a chat input.
 */
export function transcriptToMarkdown(
  payload: TranscriptPayload,
  opts?: TranscriptToMarkdownOptions,
): string {
  const resolved: Required<TranscriptToMarkdownOptions> = {
    includeThinking: opts?.includeThinking ?? false,
    includeToolBlocks: opts?.includeToolBlocks ?? true,
  }

  const sections = payload.messages
    .map((m) => renderMessage(m, resolved))
    .filter((s): s is string => s !== null)

  return sections.join('\n\n')
}
