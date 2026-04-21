import { useMemo, useState } from 'react'
import { FolderOpen, Pause, Play, Square } from 'lucide-react'
import type { Agent, AgentState, MessageKind, MessageLog } from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'

interface Props {
  agent: Agent
}

const MAX_ENTRIES = 20
const CONTENT_TRUNCATE = 160

/** Tailwind classes for the state pill — covers all AgentState values. */
function statePillStyles(state: AgentState): string {
  switch (state) {
    case 'running':
      return 'bg-status-generating/15 text-status-generating'
    case 'paused':
      return 'bg-status-input/15 text-status-input'
    case 'error':
      return 'bg-status-attention/15 text-status-attention'
    case 'idle':
    default:
      return 'bg-bg-4 text-text-2'
  }
}

function kindPillStyles(kind: MessageKind): string {
  switch (kind) {
    case 'error':
      return 'bg-status-attention/15 text-status-attention'
    case 'delegation':
      return 'bg-accent-500/15 text-accent-400'
    case 'approval_request':
      return 'bg-status-input/15 text-status-input'
    case 'status':
      return 'bg-bg-4 text-text-3'
    case 'output':
    default:
      return 'bg-bg-3 text-text-2'
  }
}

export default function RuntimeTab({ agent }: Props) {
  const messageLog = useOrchestra((s) => s.messageLog)
  const pauseAgent = useOrchestra((s) => s.pauseAgent)
  const stopAgent = useOrchestra((s) => s.stopAgent)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Filter + slice the last 20 entries relevant to this agent.
  // Re-runs on every messageLog change, which is exactly what F4.7 calls for
  // ("auto-updates as new log entries come in"). The rolling cap of 500 in
  // the store keeps this cheap.
  const entries = useMemo<MessageLog[]>(() => {
    const all = messageLog.filter(
      (m) => m.fromAgentId === agent.id || m.toAgentId === agent.id
    )
    return all.slice(-MAX_ENTRIES).reverse()
  }, [messageLog, agent.id])

  const isPaused = agent.state === 'paused'

  // F7 doesn't define a separate resume IPC — pause on a paused agent is the
  // agreed toggle until the main-side exposes an explicit resume. Wire this
  // to a dedicated method when it lands.
  const onToggle = (): void => {
    void pauseAgent(agent.id)
  }
  const onStop = (): void => {
    void stopAgent(agent.id)
  }
  const onOpenWorktree = (): void => {
    // Stub — wired once we have window.api.orchestra.agent.openWorktree.
    // Intentionally a no-op rather than silently throwing so click-through
    // during UI smoke tests doesn't error out.
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="df-label mb-1.5">state</div>
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statePillStyles(
            agent.state
          )}`}
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {agent.state}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-border-soft bg-bg-1 px-2.5 py-1.5 text-xs text-text-2 hover:border-border-mid hover:bg-bg-3 hover:text-text-1"
          title={isPaused ? 'resume agent' : 'pause agent'}
        >
          {isPaused ? (
            <>
              <Play size={12} strokeWidth={1.75} />
              resume
            </>
          ) : (
            <>
              <Pause size={12} strokeWidth={1.75} />
              pause
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-status-attention/40 bg-status-attention/10 px-2.5 py-1.5 text-xs font-semibold text-status-attention hover:bg-status-attention/20"
          title="stop agent"
        >
          <Square size={12} strokeWidth={2} />
          stop
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenWorktree}
        disabled
        className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-border-soft bg-bg-1 px-3 py-1.5 text-xs text-text-3 opacity-60"
        title="coming soon"
      >
        <FolderOpen size={12} strokeWidth={1.75} />
        open worktree in editor
      </button>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="df-label">recent messages</div>
          <span className="font-mono text-[10px] text-text-4">
            {entries.length} / {MAX_ENTRIES}
          </span>
        </div>
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-soft bg-bg-1 px-3 py-4 text-center text-[11px] text-text-4">
            no activity yet
          </div>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((m) => {
              const isOpen = expanded[m.id] === true
              const needsTruncate = m.content.length > CONTENT_TRUNCATE
              const shown =
                isOpen || !needsTruncate
                  ? m.content
                  : `${m.content.slice(0, CONTENT_TRUNCATE)}…`
              return (
                <li
                  key={m.id}
                  className="rounded-md border border-border-soft bg-bg-1 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-text-4">
                      {new Date(m.at).toLocaleTimeString()}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${kindPillStyles(
                        m.kind
                      )}`}
                    >
                      {m.kind}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!needsTruncate) return
                      setExpanded((prev) => ({ ...prev, [m.id]: !isOpen }))
                    }}
                    className={`mt-1 block w-full whitespace-pre-wrap text-left font-mono text-[11px] leading-snug text-text-2 ${
                      needsTruncate ? 'cursor-pointer hover:text-text-1' : 'cursor-default'
                    }`}
                    aria-expanded={needsTruncate ? isOpen : undefined}
                  >
                    {shown}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
