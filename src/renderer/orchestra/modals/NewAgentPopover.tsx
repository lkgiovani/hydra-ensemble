/**
 * NewAgentPopover — small popover anchored near the double-click position
 * that creates a new agent on the canvas. PRD.md §10.F2.
 *
 * Unlike the centred dialogs used elsewhere (NewSessionDialog), this one is
 * deliberately compact: it appears right where the user clicked so the new
 * card lands visually in context. Viewport clamping with a 16px margin keeps
 * it on-screen when the user clicks near any edge.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { useOrchestra } from '../state/orchestra'

interface Props {
  open: boolean
  onClose: () => void
  teamId: string
  /** Viewport coordinates of the double-click. Used to anchor the popover. */
  position: { x: number; y: number }
  /** Optional react-flow coordinates for the eventual card. When provided,
   *  the agent is created at this canvas position; otherwise we fall back
   *  to the viewport `position`. Canvas.tsx passes both because the screen
   *  coords drive placement and the flow coords drive the domain value. */
  flowPosition?: { x: number; y: number }
}

type Preset = 'blank' | 'reviewer' | 'dev' | 'qa' | 'pm'
type ModelChoice = 'inherit' | 'opus' | 'sonnet' | 'haiku'

interface PresetDef {
  id: Preset
  label: string
  name: string
  role: string
}

/** Preset descriptors drive both the chip row and the name/role prefill. */
const PRESETS: ReadonlyArray<PresetDef> = [
  { id: 'blank', label: 'Blank', name: 'Agent', role: '' },
  { id: 'reviewer', label: 'Reviewer', name: 'Reviewer', role: 'Code reviewer' },
  { id: 'dev', label: 'Dev', name: 'Developer', role: 'Implementation engineer' },
  { id: 'qa', label: 'QA', name: 'QA', role: 'Test gap finder' },
  { id: 'pm', label: 'PM', name: 'PM', role: 'Product manager' }
]

/** 8-colour chip row. Hex values map to the `Agent.color` string on the
 *  domain model; the canvas card renders its accent from this directly.
 *  Typed as a tuple so `COLORS[0]` is a guaranteed-defined string under
 *  `noUncheckedIndexedAccess`. */
const COLORS = [
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#f87171', // red-400
  '#fb923c', // orange-400
  '#facc15', // yellow-400
  '#4ade80', // green-400
  '#22d3ee' // cyan-400
] as const
const DEFAULT_COLOR: string = COLORS[0]

const POPOVER_WIDTH = 320
const VIEWPORT_MARGIN = 16

/** Map the short model picker value to what the backend stores. `inherit`
 *  sends an empty string so Agent.model falls back to Team.defaultModel. */
function resolveModelValue(choice: ModelChoice): string {
  switch (choice) {
    case 'opus':
      return 'claude-opus-4-7'
    case 'sonnet':
      return 'claude-sonnet-4-5'
    case 'haiku':
      return 'claude-haiku-4-5'
    case 'inherit':
    default:
      return ''
  }
}

/** Fallback preset — used when a lookup misses. Kept explicit so the name
 *  prefill never silently resolves to `undefined`. */
const BLANK_PRESET: PresetDef = { id: 'blank', label: 'Blank', name: 'Agent', role: '' }

function findPreset(id: Preset): PresetDef {
  return PRESETS.find((p) => p.id === id) ?? BLANK_PRESET
}

/** Produce a default display name per preset, numbered against the agents
 *  already on the active team so repeated clicks don't collide ("Reviewer 1",
 *  "Reviewer 2", …). */
function nextPresetName(teamId: string, preset: Preset): string {
  const base = findPreset(preset).name
  const existing = useOrchestra
    .getState()
    .agents.filter((a) => a.teamId === teamId && a.name.startsWith(base))
  return `${base} ${existing.length + 1}`
}

/** Re-export as named so callers using `import { NewAgentPopover }` work
 *  alongside `import NewAgentPopover from ...`. */
export function NewAgentPopover(props: Props) {
  return <NewAgentPopoverImpl {...props} />
}

export default NewAgentPopover

function NewAgentPopoverImpl({ open, onClose, teamId, position, flowPosition }: Props) {
  const createAgent = useOrchestra((s) => s.createAgent)

  const [preset, setPreset] = useState<Preset>('blank')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [model, setModel] = useState<ModelChoice>('inherit')
  const [color, setColor] = useState<string>(DEFAULT_COLOR)
  const [submitting, setSubmitting] = useState(false)

  const popoverRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [resolvedPos, setResolvedPos] = useState<{ x: number; y: number }>(position)

  // Reset form whenever the popover opens. The initial preset is always
  // Blank so a user who clicks around quickly doesn't inherit the previous
  // session's choice.
  useEffect(() => {
    if (!open) return
    setPreset('blank')
    setName(nextPresetName(teamId, 'blank'))
    setRole('')
    setModel('inherit')
    setColor(DEFAULT_COLOR)
    setSubmitting(false)
  }, [open, teamId])

  // Focus the name field on open — the typical path is accept the
  // prefilled name and hit Enter, so the caret needs to be ready.
  useEffect(() => {
    if (open) nameInputRef.current?.focus()
  }, [open])

  // Clamp the popover within the viewport with a 16px margin. Measured
  // *after* mount so we know the real height; width is fixed at 320 so we
  // can clamp horizontally without waiting on layout.
  useLayoutEffect(() => {
    if (!open) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const height = popoverRef.current?.offsetHeight ?? 360
    const maxX = vw - POPOVER_WIDTH - VIEWPORT_MARGIN
    const maxY = vh - height - VIEWPORT_MARGIN
    const x = Math.min(Math.max(position.x, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, maxX))
    const y = Math.min(Math.max(position.y, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, maxY))
    setResolvedPos({ x, y })
  }, [open, position])

  // Esc cancels. Listener only runs while open so other modals aren't
  // stolen on a shared global keydown bus.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const canSubmit = useMemo(() => name.trim().length > 0 && !submitting, [name, submitting])

  if (!open) return null

  const applyPreset = (next: Preset): void => {
    setPreset(next)
    setName(nextPresetName(teamId, next))
    setRole(findPreset(next).role)
  }

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const created = await createAgent({
        teamId,
        // The domain `position` on Agent is in canvas/flow coordinates,
        // not viewport — prefer `flowPosition` when Canvas provided it.
        position: flowPosition ?? position,
        name: name.trim(),
        role: role.trim(),
        preset,
        model: resolveModelValue(model),
        color
      })
      if (created) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70]"
      onMouseDown={(e) => {
        // Click on the backdrop (anywhere that isn't the popover) cancels.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="new agent"
        className="df-fade-in absolute flex flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{
          left: resolvedPos.x,
          top: resolvedPos.y,
          width: POPOVER_WIDTH,
          borderRadius: 'var(--radius-lg)'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border-soft bg-bg-1 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <UserPlus size={12} strokeWidth={1.75} className="text-accent-400" />
            <span className="df-label">new agent</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="close"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex flex-col gap-3 p-3">
          {/* Preset chip row */}
          <div>
            <label className="df-label mb-1.5 block">preset</label>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => {
                const sel = p.id === preset
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`rounded-sm border px-2 py-1 text-[11px] transition ${
                      sel
                        ? 'border-accent-500 bg-accent-500/15 text-text-1'
                        : 'border-border-soft bg-bg-1 text-text-3 hover:border-border-mid hover:bg-bg-3 hover:text-text-1'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="df-label mb-1.5 block">name</label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) void submit()
              }}
              placeholder="agent name"
              className="w-full rounded-sm border border-border-mid bg-bg-1 px-2 py-1.5 font-mono text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
            />
          </div>

          {/* Role */}
          <div>
            <label className="df-label mb-1.5 block">role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) void submit()
              }}
              placeholder="e.g. code reviewer"
              className="w-full rounded-sm border border-border-mid bg-bg-1 px-2 py-1.5 font-mono text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
            />
          </div>

          {/* Model */}
          <div>
            <label className="df-label mb-1.5 block">model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelChoice)}
              className="w-full rounded-sm border border-border-mid bg-bg-1 px-2 py-1.5 font-mono text-xs text-text-1 focus:border-accent-500 focus:outline-none"
            >
              <option value="inherit">inherit (team default)</option>
              <option value="opus">opus</option>
              <option value="sonnet">sonnet</option>
              <option value="haiku">haiku</option>
            </select>
          </div>

          {/* Colour chips */}
          <div>
            <label className="df-label mb-1.5 block">color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => {
                const sel = c === color
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`color ${c}`}
                    className={`h-5 w-5 rounded-full border transition ${
                      sel
                        ? 'scale-110 border-text-1 ring-2 ring-accent-500/50'
                        : 'border-border-mid hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-1.5 border-t border-border-soft bg-bg-1 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border-soft px-2.5 py-1 text-[11px] text-text-2 hover:border-border-mid hover:bg-bg-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-sm bg-accent-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
          >
            {submitting ? 'creating…' : 'Create'}
          </button>
        </footer>
      </div>
    </div>
  )
}
