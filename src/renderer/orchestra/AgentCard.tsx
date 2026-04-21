import { Fragment, memo, useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import {
  Crown,
  User,
  Wrench,
  ClipboardCheck,
  ShieldCheck,
  Bug,
  Code2,
  Briefcase
} from 'lucide-react'
import type { Agent, AgentState } from '../../shared/orchestra'
import { useOrchestra } from './state/orchestra'

/**
 * Custom react-flow node for an Orchestra agent.
 *
 * Rendered exclusively via `nodeTypes.agent = AgentCard`. Layout, colours and
 * dot semantics follow PRD §11 "Card anatomy".
 */

export type AgentNode = Node<{ agent: Agent; isMain: boolean }, 'agent'>

/** Role -> lucide icon. Unknown roles fall back to the generic user glyph. */
function iconForRole(role: string): typeof User {
  const key = role.trim().toLowerCase()
  if (key.includes('pm') || key.includes('manager')) return Briefcase
  if (key.includes('review')) return ClipboardCheck
  if (key.includes('qa') || key.includes('test')) return Bug
  if (key.includes('security') || key.includes('audit')) return ShieldCheck
  if (key.includes('dev') || key.includes('engineer') || key.includes('backend') || key.includes('frontend')) return Code2
  if (key.includes('ops') || key.includes('infra') || key.includes('devops')) return Wrench
  return User
}

const STATE_DOT: Record<AgentState, string> = {
  idle: 'bg-[var(--color-status-idle)]',
  running: 'bg-[var(--color-status-running)] animate-pulse',
  paused: 'bg-[var(--color-status-thinking)]',
  error: 'bg-[var(--color-status-attention)]'
}

const STATE_LABEL: Record<AgentState, string> = {
  idle: 'idle',
  running: 'running',
  paused: 'paused',
  error: 'error'
}

/** Four connection anchors. Hover reveals them; react-flow wires dragging. */
const HANDLES: Array<{ id: string; position: Position; style: string }> = [
  { id: 'n', position: Position.Top, style: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2' },
  { id: 's', position: Position.Bottom, style: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2' },
  { id: 'w', position: Position.Left, style: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2' },
  { id: 'e', position: Position.Right, style: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2' }
]

function AgentCardImpl(props: NodeProps<AgentNode>) {
  const { data, selected } = props
  const { agent, isMain } = data
  const RoleIcon = iconForRole(agent.role)
  const updateAgent = useOrchestra((s) => s.updateAgent)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(agent.name)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Sync local draft when the agent's persisted name changes upstream (IPC
  // events from main). Without this, an external rename would be overwritten
  // by the stale draft the next time the user enters edit mode.
  useEffect(() => {
    if (!editing) setDraft(agent.name)
  }, [agent.name, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== agent.name) {
      void updateAgent({ id: agent.id, patch: { name: trimmed } })
    } else {
      setDraft(agent.name)
    }
    setEditing(false)
  }, [draft, agent.id, agent.name, updateAgent])

  const cancel = useCallback(() => {
    setDraft(agent.name)
    setEditing(false)
  }, [agent.name])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
      }
    },
    [commit, cancel]
  )

  // Active delegation sub-status is populated elsewhere (runtime tab +
  // delegate tool flow). For now we surface the agent's free-form status
  // if it later lands on `agent.description`-like fields; keeping it
  // inline so PRD §11 sub-status line is ready to bind.
  const subStatus: string | null = null

  const ringColor = agent.color ?? 'var(--color-accent-500)'

  return (
    <div
      className={[
        'group relative min-w-[180px] select-none rounded-[var(--radius-md)]',
        'bg-[var(--color-bg-2)] text-[var(--color-text-1)]',
        'border border-[var(--color-border-mid)]',
        'transition-[box-shadow,border-color] duration-150',
        'font-mono text-[12px]'
      ].join(' ')}
      style={{
        boxShadow: selected
          ? `0 0 0 2px ${ringColor} inset`
          : 'var(--shadow-card)'
      }}
      aria-label={`agent ${agent.name} — ${STATE_LABEL[agent.state]}`}
    >
      {/* Anchor dots: each side carries a matched source + target handle so
          drag-out and drop-on both work on the same dot. Visible on hover or
          when the card is selected. Target sits under the source in the
          DOM so drops register; source renders the coloured pip. */}
      {HANDLES.map((h) => (
        <Fragment key={h.id}>
          <Handle
            id={`${h.id}-t`}
            type="target"
            position={h.position}
            className={[
              'absolute !h-3 !w-3 !rounded-full !border-0 !bg-transparent',
              'z-10',
              h.style
            ].join(' ')}
            isConnectable
          />
          <Handle
            id={`${h.id}-s`}
            type="source"
            position={h.position}
            className={[
              'absolute !h-2 !w-2 !rounded-full !border-0',
              '!bg-[var(--color-accent-500)]',
              'opacity-0 transition-opacity duration-100',
              'group-hover:opacity-100',
              selected ? '!opacity-100' : '',
              h.style
            ].join(' ')}
            isConnectable
          />
        </Fragment>
      ))}

      <div className="flex items-center gap-2 px-3 pt-2">
        {isMain ? (
          <Crown
            className="h-3.5 w-3.5 text-[var(--color-accent-500)]"
            aria-label="main agent"
          />
        ) : (
          <RoleIcon
            className="h-3.5 w-3.5 text-[var(--color-text-3)]"
            aria-hidden
          />
        )}
        <span className="truncate text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
          {agent.role || 'agent'}
        </span>
      </div>

      <div
        className="px-3 pb-1 pt-0.5"
        onDoubleClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            className={[
              'w-full bg-transparent text-[13px] font-semibold',
              'outline-none border-b border-[var(--color-border-mid)]',
              'focus:border-[var(--color-accent-500)]'
            ].join(' ')}
            aria-label="edit agent name"
          />
        ) : (
          <div
            className="truncate text-[13px] font-semibold text-[var(--color-text-1)]"
            title={agent.name}
          >
            {agent.name}
          </div>
        )}
      </div>

      <div className="mx-3 my-1 border-t border-dashed border-[var(--color-border-soft)]" />

      <div className="flex items-center gap-2 px-3 pb-2">
        <span
          className={[
            'inline-block h-2 w-2 rounded-full',
            STATE_DOT[agent.state]
          ].join(' ')}
          aria-hidden
        />
        <span className="text-[11px] text-[var(--color-text-2)]">
          {STATE_LABEL[agent.state]}
        </span>
      </div>

      {subStatus ? (
        <div className="truncate px-3 pb-2 text-[11px] text-[var(--color-text-3)]">
          {subStatus}
        </div>
      ) : null}
    </div>
  )
}

export const AgentCard = memo(AgentCardImpl)
AgentCard.displayName = 'AgentCard'

export default AgentCard
