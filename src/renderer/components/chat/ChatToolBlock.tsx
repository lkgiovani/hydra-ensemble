import { useState } from 'react'
import {
  ChevronRight,
  FileText,
  Pencil,
  Terminal,
  Search,
  ListTodo,
  Globe,
  AlertTriangle,
  Wrench,
  FilePlus
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TranscriptBlock } from '../../../shared/types'
import { useEditor } from '../../state/editor'

const ICON: Record<string, LucideIcon> = {
  Read: FileText,
  Write: FilePlus,
  Edit: Pencil,
  Update: Pencil,
  MultiEdit: Pencil,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  TodoWrite: ListTodo,
  WebFetch: Globe,
  WebSearch: Globe
}

function truncate(s: string, max: number): string {
  const trimmed = s.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1) + '…'
}

function pickPath(input: Record<string, unknown>): string | null {
  const v = input['file_path'] ?? input['path'] ?? input['notebook_path']
  return typeof v === 'string' ? v : null
}

function oneLineSummary(name: string, input: Record<string, unknown>): string {
  const path = pickPath(input)
  if (path) return path
  const cmd = input['command']
  if (typeof cmd === 'string') return truncate(cmd, 100)
  const pattern = input['pattern'] ?? input['query']
  if (typeof pattern === 'string') return truncate(pattern, 80)
  const description = input['description']
  if (typeof description === 'string') return truncate(description, 80)
  if (name === 'TodoWrite' && Array.isArray(input['todos'])) {
    return `${(input['todos'] as unknown[]).length} items`
  }
  // Fallback: stringified first value
  const firstKey = Object.keys(input)[0]
  if (firstKey) return `${firstKey}: ${truncate(String(input[firstKey]), 80)}`
  return ''
}

export function ToolUseBlock({
  block
}: {
  block: Extract<TranscriptBlock, { kind: 'tool_use' }>
}) {
  const [expanded, setExpanded] = useState(false)
  const openFile = useEditor((s) => s.openFile)
  const openEditor = useEditor((s) => s.openEditor)
  const Icon = ICON[block.name] ?? Wrench
  const summary = oneLineSummary(block.name, block.input)
  const path = pickPath(block.input)

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
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          className={`shrink-0 text-text-3 transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <Icon size={12} strokeWidth={1.75} className="shrink-0 text-accent-400" />
        <span className="shrink-0 font-mono text-text-2">{block.name}</span>
        {summary ? (
          <span
            className="truncate font-mono text-text-3"
            onClick={
              path
                ? (e) => {
                    e.stopPropagation()
                    void openFile(path)
                    openEditor()
                  }
                : undefined
            }
          >
            {summary}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <pre className="df-scroll max-h-80 overflow-auto border-t border-border-soft bg-bg-1 px-2.5 py-2 font-mono text-[11px] text-text-2">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

export function ToolResultBlock({
  block
}: {
  block: Extract<TranscriptBlock, { kind: 'tool_result' }>
}) {
  const [expanded, setExpanded] = useState(false)
  const text = block.text.trim()
  if (text.length === 0) return null
  const multiline = text.includes('\n') || text.length > 120
  const preview = multiline ? text.split('\n')[0] ?? text : text

  return (
    <div
      className={`overflow-hidden border ${
        block.isError ? 'border-status-attention/50 bg-status-attention/5' : 'border-border-soft bg-bg-2'
      }`}
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      <button
        type="button"
        onClick={() => multiline && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
          multiline ? 'hover:bg-bg-3' : 'cursor-default'
        }`}
      >
        {multiline ? (
          <ChevronRight
            size={12}
            strokeWidth={1.75}
            className={`shrink-0 text-text-3 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        ) : (
          <span className="w-3" />
        )}
        {block.isError ? (
          <AlertTriangle
            size={12}
            strokeWidth={1.75}
            className="shrink-0 text-status-attention"
          />
        ) : null}
        <span className="shrink-0 font-mono text-text-3">result</span>
        <span className="truncate font-mono text-text-2">{truncate(preview, 140)}</span>
      </button>
      {expanded && multiline ? (
        <pre className="df-scroll max-h-96 overflow-auto border-t border-border-soft bg-bg-1 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text-2">
          {text}
        </pre>
      ) : null}
    </div>
  )
}
