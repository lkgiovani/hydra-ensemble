import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import type { Agent, UpdateAgentInput } from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'
import { AGENT_COLORS, hexAlpha } from '../../lib/agent'
import type { InspectorTabKey } from './index'

interface Props {
  agent: Agent
  onSwitchTab: (key: InspectorTabKey) => void
}

const MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'claude-opus-4-7', label: 'claude-opus-4-7' },
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5' },
  // Empty string means "inherit Team.defaultModel" per Agent.model contract.
  { value: '', label: 'inherit from team' }
]

// Small fixed palette — first 8 of the shared AGENT_COLORS constant. Keeping
// it small avoids overwhelming the narrow 360px drawer and stays consistent
// with F4.3 ("color picker — small palette of 8 choices").
const COLOR_PALETTE = AGENT_COLORS.slice(0, 8)

const DEBOUNCE_MS = 400

export default function IdentityTab({ agent, onSwitchTab }: Props) {
  const updateAgent = useOrchestra((s) => s.updateAgent)
  const deleteAgent = useOrchestra((s) => s.deleteAgent)

  // Local draft mirror of the fields we edit. Initialized from the current
  // agent and re-synced when the id changes (not on every agent update —
  // otherwise typing would be clobbered by the `agent.changed` echo).
  const [name, setName] = useState(agent.name)
  const [role, setRole] = useState(agent.role)
  const [description, setDescription] = useState(agent.description)
  const [model, setModel] = useState(agent.model)
  const [maxTokens, setMaxTokens] = useState(agent.maxTokens)
  const [color, setColor] = useState(agent.color ?? '')

  // Reset drafts only when the inspector switches to a different agent.
  // Using agent.id as the dependency avoids resetting while the user types
  // after a round-tripped `agent.changed` event updates the agent prop.
  useEffect(() => {
    setName(agent.name)
    setRole(agent.role)
    setDescription(agent.description)
    setModel(agent.model)
    setMaxTokens(agent.maxTokens)
    setColor(agent.color ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id])

  // Debounced write-through. One timer covers all fields — they share the
  // same patch endpoint so batching is free and reduces IPC chatter.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const patch: UpdateAgentInput['patch'] = {}
    if (name !== agent.name) patch.name = name
    if (role !== agent.role) patch.role = role
    if (description !== agent.description) patch.description = description
    if (model !== agent.model) patch.model = model
    if (maxTokens !== agent.maxTokens) patch.maxTokens = maxTokens
    const nextColor = color || undefined
    if (nextColor !== agent.color) patch.color = nextColor
    if (Object.keys(patch).length === 0) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void updateAgent({ id: agent.id, patch })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [name, role, description, model, maxTokens, color, agent, updateAgent])

  const onDelete = (): void => {
    const ok = window.confirm(
      `Delete agent "${agent.name}"? This removes the agent from the team ` +
        `and cannot be undone.`
    )
    if (!ok) return
    void deleteAgent(agent.id)
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="df-label mb-1.5 block">name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 font-mono text-sm text-text-1 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="df-label mb-1.5 block">role</label>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. backend reviewer"
          className="w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 text-sm text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="df-label mb-1.5 block">description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="what this agent is responsible for"
          className="df-scroll w-full resize-none rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 text-sm text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="df-label mb-1.5 block">model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 font-mono text-xs text-text-1 focus:border-accent-500 focus:outline-none"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value || 'inherit'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="df-label mb-1.5 block">max tokens</label>
        <input
          type="number"
          min={256}
          step={256}
          value={maxTokens}
          onChange={(e) => {
            const n = Number(e.target.value)
            // Guard against NaN from an empty input — keep the previous value
            // so the debounced write doesn't send junk to main.
            if (Number.isFinite(n) && n > 0) setMaxTokens(n)
          }}
          className="w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 font-mono text-sm text-text-1 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="df-label mb-1.5 block">color</label>
        <div className="grid grid-cols-8 gap-1.5">
          {COLOR_PALETTE.map((c) => {
            const selected = color === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-full rounded-sm transition ${
                  selected ? 'ring-2 ring-text-1 ring-offset-2 ring-offset-bg-2' : ''
                }`}
                style={{
                  backgroundColor: c,
                  boxShadow: `inset 0 0 0 1px ${hexAlpha(c, 0.6)}`
                }}
                aria-label={`accent ${c}`}
                aria-pressed={selected}
              />
            )
          })}
        </div>
      </div>

      <div className="border-t border-border-soft pt-3">
        <button
          type="button"
          onClick={() => onSwitchTab('soul')}
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-border-soft bg-bg-1 px-3 py-1.5 text-xs text-text-2 hover:border-border-mid hover:bg-bg-3 hover:text-text-1"
          // When an IPC for "open in external editor" lands, swap this for
          // window.api.orchestra.agent.openSoul(agent.id). For now we hand
          // off to the embedded Soul tab inside the drawer.
          title="open soul.md"
        >
          <ExternalLink size={12} strokeWidth={1.75} />
          open soul.md in editor
        </button>
      </div>

      <div className="pt-1">
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-status-attention/40 bg-status-attention/10 px-3 py-1.5 text-xs font-semibold text-status-attention hover:bg-status-attention/20"
        >
          <Trash2 size={12} strokeWidth={2} />
          delete agent
        </button>
      </div>
    </div>
  )
}
