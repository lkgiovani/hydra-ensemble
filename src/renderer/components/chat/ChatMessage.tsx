import { User, Bot, RotateCcw, Info, Brain } from 'lucide-react'
import type { TranscriptMessage } from '../../../shared/types'
import ChatMarkdown from './ChatMarkdown'
import { ToolUseBlock, ToolResultBlock } from './ChatToolBlock'

interface Props {
  message: TranscriptMessage
  /** Fires when the user asks to rewind from this message. */
  onRewind?: (message: TranscriptMessage) => void
  /** Rewind control disabled until claude is at the input prompt. */
  canRewind?: boolean
}

export default function ChatMessage({ message, onRewind, canRewind }: Props) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // System messages are typically hidden init / context lines. Render
  // them minimally so they don't distract but stay visible for debug.
  if (isSystem) {
    return (
      <div className="flex items-center gap-2 px-4 py-1 text-[11px] text-text-4">
        <Info size={11} strokeWidth={1.5} />
        <span className="font-mono">system</span>
        <span className="truncate">
          {message.blocks
            .filter((b) => b.kind === 'text' || b.kind === 'thinking')
            .map((b) => ('text' in b ? b.text : ''))
            .join(' · ')
            .slice(0, 160)}
        </span>
      </div>
    )
  }

  const Avatar = isUser ? User : Bot

  return (
    <div className="group relative flex gap-3 px-4 py-3 hover:bg-bg-1/40">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${
          isUser ? 'bg-accent-500/15 text-accent-400' : 'bg-bg-3 text-text-2'
        }`}
      >
        <Avatar size={14} strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-text-1">
            {isUser ? 'you' : 'claude'}
          </span>
          {message.model ? (
            <span className="font-mono text-[10px] text-text-4">{message.model}</span>
          ) : null}
          {message.timestamp ? (
            <span className="font-mono text-[10px] text-text-4">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          ) : null}
        </div>

        {message.blocks.map((block, i) => {
          const key = `${message.index}-${i}`
          if (block.kind === 'text') {
            return <ChatMarkdown key={key} text={block.text} />
          }
          if (block.kind === 'thinking') {
            return (
              <div
                key={key}
                className="flex gap-2 border-l-2 border-border-soft bg-bg-1/60 px-3 py-2 text-xs italic text-text-3"
              >
                <Brain size={12} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{block.text}</span>
              </div>
            )
          }
          if (block.kind === 'tool_use') {
            return <ToolUseBlock key={key} block={block} />
          }
          if (block.kind === 'tool_result') {
            return <ToolResultBlock key={key} block={block} />
          }
          return null
        })}
      </div>

      {isUser && onRewind ? (
        <button
          type="button"
          disabled={!canRewind}
          onClick={() => onRewind(message)}
          className="absolute right-4 top-3 flex items-center gap-1 rounded-sm border border-border-soft bg-bg-2 px-1.5 py-1 text-[10px] text-text-3 opacity-0 transition-opacity hover:border-border-mid hover:text-text-1 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
          title={canRewind ? 'rewind the session from this message' : 'only available when claude is at the prompt'}
        >
          <RotateCcw size={11} strokeWidth={1.75} />
          rewind
        </button>
      ) : null}
    </div>
  )
}
