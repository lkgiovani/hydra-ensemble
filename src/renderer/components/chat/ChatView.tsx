import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  Send,
  ChevronDown,
  MessageSquare
} from 'lucide-react'
import type {
  SessionMeta,
  TranscriptMessage as TranscriptMessageT
} from '../../../shared/types'
import { useTranscripts } from '../../state/transcripts'
import { useSessions } from '../../state/sessions'
import ChatToolbar, { type Effort } from './ChatToolbar'
import ChatMessage from './ChatMessage'

interface Props {
  session: SessionMeta
  visible: boolean
}

function formatTokens(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

/** Derive the day key (YYYY-MM-DD) for a timestamp so we can group
 *  messages by calendar day in the user's locale. */
function dayKey(iso: string | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  // Local date, not UTC — the user cares about their wall-clock day.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Human label for a day divider — "Today", "Yesterday", or a short
 *  month-day form for anything older. */
function dayLabel(iso: string): string {
  const t = Date.parse(iso)
  const d = new Date(t)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  // Include the year only when it's different from the current year.
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === today.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  return d.toLocaleDateString([], opts)
}

/** Three-dot "typing…" bubble. Pure CSS, no keyframes needed beyond
 *  tailwind's built-in `animate-bounce` + staggered delays. */
function TypingBubble({ session }: { session: SessionMeta }) {
  const accent = session.accentColor ?? '#7aa2f7'
  const avatarFg = (() => {
    const hex = accent.replace('#', '')
    if (hex.length !== 6) return '#fff'
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if ([r, g, b].some(Number.isNaN)) return '#fff'
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return l > 0.6 ? '#0b0b0d' : '#fff'
  })()
  const initial = (() => {
    const name = (session.name ?? '').trim()
    if (name.length === 0) return 'C'
    const ch = name.charAt(0)
    return /[\p{L}\p{N}]/u.test(ch) ? ch.toUpperCase() : 'C'
  })()
  return (
    <div className="flex items-start gap-2.5 px-4 pb-2 pt-1">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center text-[12px] font-semibold"
        style={{
          backgroundColor: accent,
          color: avatarFg,
          borderRadius: '9999px'
        }}
      >
        {initial}
      </div>
      <div
        className="flex items-center gap-1 border border-border-soft bg-bg-2 px-3.5 py-2.5"
        style={{ borderRadius: 'var(--radius-sm)' }}
        aria-label="claude is thinking"
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-text-3 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-text-3 animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-text-3 animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  )
}

/** Welcome / empty-state card — greeting + agent avatar + three canned
 *  suggestion chips that pre-fill the composer. */
function EmptyState({
  session,
  onSuggest
}: {
  session: SessionMeta
  onSuggest: (text: string) => void
}) {
  const accent = session.accentColor ?? '#7aa2f7'
  const avatarFg = (() => {
    const hex = accent.replace('#', '')
    if (hex.length !== 6) return '#fff'
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if ([r, g, b].some(Number.isNaN)) return '#fff'
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return l > 0.6 ? '#0b0b0d' : '#fff'
  })()
  const initial = (() => {
    const name = (session.name ?? '').trim()
    if (name.length === 0) return 'C'
    const ch = name.charAt(0)
    return /[\p{L}\p{N}]/u.test(ch) ? ch.toUpperCase() : 'C'
  })()
  const name = session.name || 'Claude'
  const suggestions = ['Review this PR', 'Write tests', 'Explain this file']
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center text-2xl font-semibold shadow-pop"
        style={{
          backgroundColor: accent,
          color: avatarFg,
          borderRadius: '9999px'
        }}
      >
        {initial}
      </div>
      <div>
        <div className="text-lg font-semibold text-text-1">Say hi to {name}</div>
        {session.description ? (
          <div className="mt-1 max-w-md text-xs text-text-3">{session.description}</div>
        ) : (
          <div className="mt-1 max-w-md text-xs text-text-3">
            Ask anything — or pick a starter below.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggest(s)}
            className="rounded-full border border-border-soft bg-bg-2 px-3 py-1.5 text-xs text-text-2 transition hover:border-accent-500/60 hover:bg-bg-3 hover:text-text-1"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Stub popup shown when the user types `@` or `/` in the composer.
 *  The real completion flow lives in the CLI toolbar — we just hint
 *  here so users learn the surface exists. */
function CompletionStub({ kind }: { kind: 'agent' | 'command' }) {
  const label = kind === 'agent' ? '@agent completions' : '/command completions'
  return (
    <div
      className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 right-0 mx-auto w-fit border border-border-soft bg-bg-2 px-3 py-1.5 text-[11px] text-text-3 shadow-pop df-fade-in"
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      <span className="font-semibold text-text-2">{label}</span>
      <span className="ml-1.5 text-text-4">coming soon</span>
    </div>
  )
}

export default function ChatView({ session, visible }: Props) {
  const entry = useTranscripts((s) => s.byId[session.id])
  const refresh = useTranscripts((s) => s.refresh)
  const appendPending = useTranscripts((s) => s.appendPending)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  /** Mirrors Claude Code's effort setting. We can't read it back from
   *  the TUI, so this is the user's last explicit choice — sent via
   *  `/effort <level>` each time it changes. */
  const [effort, setEffort] = useState<Effort>('auto')
  /** Mirrors `alwaysThinkingEnabled`. Toggled by writing Alt+T to the
   *  PTY (claude's built-in keyboard shortcut for the toggle). */
  const [thinking, setThinking] = useState(false)
  /** Smart-scroll: chip appears when the user has scrolled up and new
   *  messages arrive — clicking pins them back to the bottom. */
  const [showScrollChip, setShowScrollChip] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastCountRef = useRef(0)
  /** Sticky "near the bottom" flag — updated on every scroll. Used by
   *  the new-message effect to decide whether to auto-pin. */
  const nearBottomRef = useRef(true)

  // Initial load + refresh when session becomes visible.
  useEffect(() => {
    if (!visible) return
    void refresh(session.id)
  }, [visible, session.id, refresh])

  // Track how close to the bottom the user currently is. We treat
  // anything within 160px as "near bottom" — enough to forgive a small
  // wiggle during streaming without clobbering deliberate scroll-up.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = (): void => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      nearBottomRef.current = distance < 160
      if (nearBottomRef.current) setShowScrollChip(false)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [visible])

  // Auto-scroll to bottom on new messages — but only when the user was
  // already near the bottom. Otherwise surface the "↓ New messages"
  // chip so they don't lose their reading position.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const count = entry?.messages.length ?? 0
    if (count === lastCountRef.current) return
    lastCountRef.current = count
    if (nearBottomRef.current) {
      // rAF so the DOM has laid out the new row before we scroll.
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    } else {
      setShowScrollChip(true)
    }
  }, [entry?.messages.length])

  const jumpToBottom = (): void => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShowScrollChip(false)
  }

  const submit = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    try {
      // Render the user message immediately — the authoritative copy from
      // claude's JSONL will replace it once the TUI writes the line. Slash
      // commands are skipped: they aren't chat turns, they'd pollute the list.
      if (!text.trimStart().startsWith('/')) {
        appendPending(session.id, text)
      }
      sendCommand(text)
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.focus()
      }
      // User just sent something — treat as intent to follow new output.
      nearBottomRef.current = true
      setShowScrollChip(false)
    } finally {
      setSending(false)
    }
  }

  /** Apply an effort pick: keep local state in sync + fire the real
   *  `/effort <level>` slash command so claude actually updates its
   *  reasoning budget. */
  const onEffortChange = (next: Effort): void => {
    setEffort(next)
    sendCommand(`/effort ${next}`)
  }

  /** Toggle Claude Code's extended-thinking flag. There's no slash
   *  command for this — the TUI uses Alt+T as the keyboard shortcut.
   *  We write the raw escape sequence (ESC + 't') straight to the PTY
   *  without a trailing CR so claude consumes it as a keypress rather
   *  than a prompt line. */
  const onThinkingToggle = (): void => {
    setThinking((v) => !v)
    void window.api.pty.write(session.ptyId, '\x1bt')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter submits, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const onRewind = (msg: TranscriptMessageT): void => {
    // Send the /rewind slash command. Claude's TUI picks the message
    // selector from the footer — the user completes the rewind there
    // (or toggles to CLI to interact). v1: we don't try to pre-fill
    // the index, since claude's rewind picker layout isn't stable
    // across versions.
    void msg // reserved for future "rewind to index N"
    sendCommand('/rewind')
  }

  /** Single point for writing commands / messages to the PTY.
   *
   *  Optimistic 'thinking' flip is intentionally skipped for slash
   *  commands: they're usually instant (settings tweaks, /clear, etc.)
   *  and never produce a "esc to interrupt" footer for the analyzer to
   *  latch onto, so flipping leaves the pill stranded in thinking
   *  forever. Real prompts get the flip — claude will start working
   *  immediately and the analyzer confirms within ~80ms. */
  const sendCommand = (raw: string): void => {
    if (!raw) return
    const isSlash = raw.trimStart().startsWith('/')
    if (!isSlash) {
      useSessions.getState().patchSession(session.id, { state: 'thinking' })
      void window.api.session.syncState(session.id, 'thinking')
    }
    void window.api.pty.write(session.ptyId, raw + '\r')
  }

  /** Pre-fill the composer from an empty-state suggestion chip. */
  const onSuggest = (text: string): void => {
    setInput(text)
    // Defer so react flushes the value before we resize + focus.
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.style.height = 'auto'
      el.style.height = Math.min(200, el.scrollHeight) + 'px'
      el.setSelectionRange(text.length, text.length)
    })
  }

  const canInteract = session.state === 'userInput' || session.state === 'idle'
  const canRewind = canInteract
  const loading = entry?.loading ?? true
  const pending = entry?.pending ?? []
  const realMessages = entry?.messages ?? []
  const messages = pending.length > 0 ? [...realMessages, ...pending] : realMessages
  const showTyping = session.state === 'thinking' || session.state === 'generating'

  // Compute a per-message day key so we can emit a divider whenever
  // the day changes between consecutive messages.
  const dayKeys = useMemo(
    () => messages.map((m) => dayKey(m.timestamp)),
    [messages]
  )

  // Slash/@ completion hint: we show it as soon as the composer starts
  // with `/` or `@` and nothing else has been typed past the trigger.
  const trimmedInput = input.trimStart()
  const completionKind: 'command' | 'agent' | null = (() => {
    if (trimmedInput.startsWith('/')) return 'command'
    if (trimmedInput.startsWith('@')) return 'agent'
    return null
  })()

  return (
    <div className="flex h-full w-full flex-col bg-bg-1">
      {/* Toolbar: model selector + effort + thinking + commands palette + usage. */}
      <ChatToolbar
        currentModel={session.model}
        canSend={canInteract}
        onSend={sendCommand}
        effort={effort}
        onEffortChange={onEffortChange}
        thinking={thinking}
        onThinkingToggle={onThinkingToggle}
        rightChildren={
          <>
            <span className="flex items-center gap-1 text-text-4">
              <MessageSquare size={11} strokeWidth={1.75} />
              {messages.length}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-text-4">↓</span>
              {formatTokens(session.tokensIn)}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-text-4">↑</span>
              {formatTokens(session.tokensOut)}
            </span>
          </>
        }
      />

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          className="df-scroll absolute inset-0 overflow-y-auto"
        >
          {loading && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-text-3">
              <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
              loading transcript…
            </div>
          ) : messages.length === 0 ? (
            <EmptyState session={session} onSuggest={onSuggest} />
          ) : (
            <div className="py-2">
              {messages.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : undefined
                const prevKey = i > 0 ? dayKeys[i - 1] : null
                const thisKey = dayKeys[i]
                const showDivider = !!thisKey && thisKey !== prevKey
                return (
                  <div key={msg.uuid ?? msg.index}>
                    {showDivider && msg.timestamp ? (
                      <div className="my-3 flex items-center gap-3 px-5">
                        <div className="h-px flex-1 bg-border-soft" />
                        <span className="font-semibold text-[10px] uppercase tracking-wide text-text-4">
                          {dayLabel(msg.timestamp)}
                        </span>
                        <div className="h-px flex-1 bg-border-soft" />
                      </div>
                    ) : null}
                    <ChatMessage
                      message={msg}
                      session={session}
                      prevRole={showDivider ? undefined : prev?.role}
                      onRewind={onRewind}
                      canRewind={canRewind}
                    />
                  </div>
                )
              })}
              {showTyping ? <TypingBubble session={session} /> : null}
              <div className="h-2" />
            </div>
          )}
        </div>

        {/* Floating "new messages" chip — appears when the user has
            scrolled up past the live edge of the stream. */}
        {showScrollChip ? (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border-mid bg-bg-2 px-3 py-1.5 text-[11px] text-text-2 shadow-pop df-fade-in hover:bg-bg-3 hover:text-text-1"
          >
            <ChevronDown size={12} strokeWidth={2} className="text-accent-400" />
            New messages
          </button>
        ) : null}
      </div>

      {/* Composer — bottom-pinned pill with auto-grow textarea and a
          paper-plane send button nested inside. */}
      <div className="border-t border-border-soft bg-bg-1 px-3 pb-3 pt-2">
        <div className="relative mx-auto max-w-3xl">
          {completionKind ? <CompletionStub kind={completionKind} /> : null}
          <div
            className="flex items-end gap-2 border border-border-soft bg-bg-2 pl-3.5 pr-1.5 py-1.5 focus-within:border-accent-500/60 focus-within:shadow-pop"
            style={{ borderRadius: '9999px' }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                canRewind
                  ? 'Ask anything — Enter to send, Shift+Enter for newline'
                  : 'Claude is working — your message will queue'
              }
              rows={1}
              className="df-scroll flex-1 resize-none bg-transparent py-2 text-[13px] leading-relaxed text-text-1 placeholder:text-text-4 focus:outline-none"
              style={{ minHeight: '48px', maxHeight: '200px' }}
              onInput={(e) => {
                // Auto-grow from min 48 to max 200. Reset first so it
                // can also shrink when the user deletes text.
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(200, Math.max(48, el.scrollHeight)) + 'px'
              }}
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={input.trim().length === 0 || sending}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
              title="send (enter)"
              aria-label="send message"
            >
              {sending ? (
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <Send size={14} strokeWidth={2} />
              )}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-3 text-[10px] text-text-4">
            <span>Enter to send · Shift+Enter for newline</span>
            <span>{input.length ? `${input.length} chars` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
