/**
 * AgentWizard — full-screen, multi-step agent creation flow.
 *
 * Opt-in counterpart to NewAgentPopover: the popover is the quick-add, this
 * wizard walks the user through preset → identity → soul.md → skills →
 * triggers → review with a back/next stepper. Create calls the same
 * `useOrchestra.createAgent` the popover does, then overwrites the preset's
 * default soul/skills/triggers with whatever the user edited inline via
 * `window.api.orchestra.agent.writeSoul/writeSkills/writeTriggers`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  User,
  ClipboardCheck,
  Code2,
  Bug,
  Briefcase,
  FileText,
  Zap,
  Plus,
  Trash2,
  Loader2,
  AlertCircle
} from 'lucide-react'
import type { Skill, Trigger, TriggerKind } from '../../../shared/orchestra'
import { useOrchestra } from '../state/orchestra'
import { useToasts } from '../../state/toasts'

interface Props {
  open: boolean
  onClose: () => void
  teamId: string
  /** Canvas/flow coordinates where the new card will land. */
  position: { x: number; y: number }
}

type Preset = 'blank' | 'reviewer' | 'dev' | 'qa' | 'pm'
type ModelChoice = 'inherit' | 'opus' | 'sonnet' | 'haiku'
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5

interface PresetDef {
  id: Preset
  label: string
  description: string
  name: string
  role: string
  descriptionText: string
  color: string
  icon: typeof User
}

/** Preset catalog — drives every step except Triggers' manual row, which is
 *  injected by `startingTriggers()`. Keep names in sync with the popover so
 *  existing users don't see a renamed "Reviewer 1" on upgrade. */
const PRESETS: ReadonlyArray<PresetDef> = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Empty agent — fill everything in yourself.',
    name: 'Agent',
    role: '',
    descriptionText: '',
    color: '#4ea5ff',
    icon: User
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'Code reviewer with review, lint, and audit skills.',
    name: 'Reviewer',
    role: 'Code reviewer',
    descriptionText: 'Reviews pull requests for style, correctness, and coverage.',
    color: '#c084fc',
    icon: ClipboardCheck
  },
  {
    id: 'dev',
    label: 'Dev',
    description: 'Implementation engineer — writes features end-to-end.',
    name: 'Developer',
    role: 'Implementation engineer',
    descriptionText: 'Writes new features with tests and refactors existing code.',
    color: '#2ecc71',
    icon: Code2
  },
  {
    id: 'qa',
    label: 'QA',
    description: 'Test gap finder — repros bugs and writes test coverage.',
    name: 'QA',
    role: 'Test gap finder',
    descriptionText: 'Finds test gaps, turns reports into repros, runs smoke tests.',
    color: '#fbbf24',
    icon: Bug
  },
  {
    id: 'pm',
    label: 'PM',
    description: 'Product manager — scopes work and routes to specialists.',
    name: 'PM',
    role: 'Product manager',
    descriptionText: 'Breaks features into slices, delegates, reports status.',
    color: '#ec4899',
    icon: Briefcase
  }
]

const BLANK_PRESET: PresetDef = PRESETS[0]!

function findPreset(id: Preset): PresetDef {
  return PRESETS.find((p) => p.id === id) ?? BLANK_PRESET
}

/** Same palette as NewAgentPopover. 8 swatches — keeps the picker compact
 *  and consistent across the two entry points. */
const COLORS = [
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#f87171',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#22d3ee'
] as const

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

/** Quick skill bundles — duplicated from SkillsTab so this wizard has no
 *  import-time coupling to the Inspector. If these drift from SkillsTab,
 *  both should be extracted to a shared lib; TODO until then. */
const QUICK_BUNDLES: Record<Preset, Skill[]> = {
  blank: [],
  reviewer: [
    { name: 'code-review', tags: ['review', 'pr'], weight: 1.5, description: 'Reviews pull requests for style, correctness, and test coverage.' },
    { name: 'go-lint', tags: ['go', 'lint'], weight: 1.0, description: 'Catches idiomatic Go issues and lint violations.' },
    { name: 'security-audit', tags: ['security', 'audit'], weight: 1.2, description: 'Flags unsafe patterns (SQLi, unchecked user input, exposed secrets).' }
  ],
  dev: [
    { name: 'implementation', tags: ['feature', 'code'], weight: 1.5, description: 'Writes new features end-to-end with tests.' },
    { name: 'debugging', tags: ['bug', 'fix'], weight: 1.2, description: 'Investigates and fixes defects.' },
    { name: 'refactor', tags: ['refactor'], weight: 1.0, description: 'Restructures existing code without changing behavior.' }
  ],
  qa: [
    { name: 'test-writing', tags: ['test', 'qa'], weight: 1.5, description: 'Writes unit + integration tests to cover new surface.' },
    { name: 'repro-steps', tags: ['repro', 'bug'], weight: 1.2, description: 'Turns vague reports into deterministic reproductions.' },
    { name: 'e2e-smoke', tags: ['e2e', 'smoke'], weight: 1.0, description: 'Runs smoke tests against the full stack.' }
  ],
  pm: [
    { name: 'scoping', tags: ['scope', 'plan'], weight: 1.5, description: 'Breaks features into shippable slices with clear acceptance.' },
    { name: 'delegation', tags: ['route', 'handoff'], weight: 1.3, description: 'Routes work to the right specialist on the team.' },
    { name: 'status-updates', tags: ['status'], weight: 1.0, description: 'Summarizes progress for stakeholders.' }
  ]
}

const TRIGGER_KINDS: TriggerKind[] = ['manual', 'tag', 'path', 'event', 'schedule']
const TRIGGER_PLACEHOLDERS: Record<TriggerKind, string> = {
  manual: '',
  tag: 'review',
  path: '**/*.go',
  event: 'pr.opened',
  schedule: '0 9 * * 1-5'
}

/** Preset-specific trigger seeds. The manual/priority-0 row is universal
 *  (required + disabled in the editor per the wizard contract) and is
 *  injected separately by `startingTriggers()`. */
const PRESET_TRIGGERS: Record<Preset, Omit<Trigger, 'id'>[]> = {
  blank: [],
  reviewer: [
    { kind: 'tag', pattern: 'review', priority: 20, enabled: true },
    { kind: 'event', pattern: 'pr.opened', priority: 10, enabled: true }
  ],
  dev: [
    { kind: 'tag', pattern: 'feature', priority: 20, enabled: true },
    { kind: 'tag', pattern: 'bug', priority: 15, enabled: true }
  ],
  qa: [
    { kind: 'tag', pattern: 'test', priority: 20, enabled: true },
    { kind: 'path', pattern: '**/*_test.go', priority: 10, enabled: true }
  ],
  pm: [
    { kind: 'tag', pattern: 'plan', priority: 20, enabled: true },
    { kind: 'tag', pattern: 'scope', priority: 15, enabled: true }
  ]
}

function genTriggerId(): string {
  return 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Always-present manual@0 (disabled-editable) + preset-specific seeds. */
function startingTriggers(preset: Preset): Trigger[] {
  const manual: Trigger = {
    id: genTriggerId(),
    kind: 'manual',
    pattern: '',
    priority: 0,
    enabled: true
  }
  const rest = PRESET_TRIGGERS[preset].map<Trigger>((t) => ({ ...t, id: genTriggerId() }))
  return [manual, ...rest]
}

/** Preset-specific soul.md starter text. Short and opinionated so the user
 *  sees immediately what a soul should look like. */
function startingSoul(p: PresetDef): string {
  if (p.id === 'blank') {
    return `# ${p.name}\n\n## Role\n\n(describe what this agent does)\n\n## Voice & priorities\n\n- tone: concise, technical\n- priorities: …\n\n## Operating instructions\n\n- …\n`
  }
  return (
    `# ${p.name}\n` +
    `\n` +
    `## Role\n` +
    `\n` +
    `${p.descriptionText}\n` +
    `\n` +
    `## Voice & priorities\n` +
    `\n` +
    `- tone: concise, technical, action-oriented\n` +
    `- priorities: correctness > clarity > speed\n` +
    `\n` +
    `## Operating instructions\n` +
    `\n` +
    `- Investigate before proposing changes.\n` +
    `- Cite concrete evidence — logs, file paths, test output.\n` +
    `- Prefer small, reviewable patches.\n`
  )
}

/** Produce a numbered default name so repeated clicks don't collide
 *  ("Reviewer 1", "Reviewer 2", …). Matches NewAgentPopover behavior. */
function nextPresetName(teamId: string, preset: Preset): string {
  const base = findPreset(preset).name
  const existing = useOrchestra
    .getState()
    .agents.filter((a) => a.teamId === teamId && a.name.startsWith(base))
  return `${base} ${existing.length + 1}`
}

interface StepMeta {
  label: string
}

const STEPS: ReadonlyArray<StepMeta> = [
  { label: 'Preset' },
  { label: 'Identity' },
  { label: 'Soul' },
  { label: 'Skills' },
  { label: 'Triggers' },
  { label: 'Review' }
]

export default function AgentWizard({ open, onClose, teamId, position }: Props) {
  const createAgent = useOrchestra((s) => s.createAgent)
  const pushToast = useToasts((s) => s.push)

  const [step, setStep] = useState<StepIndex>(0)
  const [submitting, setSubmitting] = useState(false)

  // Preset selection drives name/role/description/color/soul/skills/triggers
  // defaults. Subsequent steps hold the user's edits on top of those seeds.
  const [preset, setPreset] = useState<Preset>('blank')

  // Identity drafts
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [modelChoice, setModelChoice] = useState<ModelChoice>('inherit')
  const [color, setColor] = useState<string>(BLANK_PRESET.color)

  // Content drafts
  const [soul, setSoul] = useState('')
  const [skills, setSkills] = useState<Skill[]>([])
  const [triggers, setTriggers] = useState<Trigger[]>([])

  // Reset + seed defaults every open. Switching presets mid-wizard blows
  // away skill/trigger edits on purpose — the whole point of picking a
  // new preset is to restart from its bundle.
  useEffect(() => {
    if (!open) return
    const p = findPreset('blank')
    setStep(0)
    setSubmitting(false)
    setPreset('blank')
    setName(nextPresetName(teamId, 'blank'))
    setRole(p.role)
    setDescription(p.descriptionText)
    setModelChoice('inherit')
    setColor(p.color)
    setSoul(startingSoul(p))
    setSkills([])
    setTriggers(startingTriggers('blank'))
  }, [open, teamId])

  const applyPreset = useCallback(
    (next: Preset): void => {
      const p = findPreset(next)
      setPreset(next)
      setName(nextPresetName(teamId, next))
      setRole(p.role)
      setDescription(p.descriptionText)
      setColor(p.color)
      setSoul(startingSoul(p))
      setSkills(QUICK_BUNDLES[next].map((s) => ({ ...s, tags: [...s.tags] })))
      setTriggers(startingTriggers(next))
    },
    [teamId]
  )

  const canGoNext = useMemo(() => {
    if (step === 1) return name.trim().length > 0
    return true
  }, [step, name])

  const next = useCallback((): void => {
    setStep((s) => (s < 5 ? ((s + 1) as StepIndex) : s))
  }, [])
  const back = useCallback((): void => {
    setStep((s) => (s > 0 ? ((s - 1) as StepIndex) : s))
  }, [])

  const submit = useCallback(async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    try {
      const created = await createAgent({
        teamId,
        position,
        preset,
        name: name.trim(),
        role: role.trim(),
        description: description.trim(),
        color,
        model: resolveModelValue(modelChoice)
      })
      if (!created) {
        // createAgent already surfaced a toast on failure.
        return
      }
      // Overwrite the preset's on-disk defaults with the wizard's edits.
      // These are best-effort: if one fails, the agent still exists — we
      // surface the specific failure so the user can retry via Inspector.
      const o = window.api?.orchestra?.agent
      if (o) {
        const results = await Promise.all([
          o.writeSoul(created.id, soul),
          o.writeSkills(created.id, skills),
          o.writeTriggers(created.id, triggers)
        ])
        const failures = results.filter((r) => !r.ok)
        if (failures.length > 0) {
          const first = failures[0]
          pushToast({
            kind: 'attention',
            title: 'Agent created — some files could not be written',
            body: first && !first.ok ? first.error : 'unknown error'
          })
        }
      }
      onClose()
    } catch (err) {
      pushToast({
        kind: 'error',
        title: 'Could not create agent',
        body: (err as Error).message
      })
    } finally {
      setSubmitting(false)
    }
  }, [
    submitting,
    createAgent,
    teamId,
    position,
    preset,
    name,
    role,
    description,
    color,
    modelChoice,
    soul,
    skills,
    triggers,
    pushToast,
    onClose
  ])

  // Keyboard: Esc closes anywhere, Arrow Left/Right navigates steps — but
  // only when focus isn't inside a form field (otherwise we'd steal arrow
  // keys from the textarea / inputs the user is actively editing).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      const t = e.target as HTMLElement | null
      const inField =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      if (inField) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (step < 5 && canGoNext) next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (step > 0) back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, canGoNext, next, back, onClose])

  if (!open) return null

  const isFinalStep = step === 5

  return (
    <div
      className="df-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-bg-0/85 px-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label="new agent wizard"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{ borderRadius: 'var(--radius-lg)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border-soft bg-bg-1 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.75} className="text-accent-400" />
            <span className="df-label">new agent</span>
            <span className="font-mono text-[10px] text-text-4">
              step {step + 1} / {STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>

        <Stepper current={step} />

        <div className="df-scroll flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <PresetStep preset={preset} onPick={applyPreset} />
          )}
          {step === 1 && (
            <IdentityStep
              name={name}
              role={role}
              description={description}
              modelChoice={modelChoice}
              color={color}
              onName={setName}
              onRole={setRole}
              onDescription={setDescription}
              onModel={setModelChoice}
              onColor={setColor}
            />
          )}
          {step === 2 && <SoulStep value={soul} onChange={setSoul} />}
          {step === 3 && (
            <SkillsStep skills={skills} onChange={setSkills} />
          )}
          {step === 4 && (
            <TriggersStep triggers={triggers} onChange={setTriggers} />
          )}
          {step === 5 && (
            <ReviewStep
              preset={preset}
              name={name}
              role={role}
              description={description}
              modelChoice={modelChoice}
              color={color}
              soul={soul}
              skills={skills}
              triggers={triggers}
              onJumpTo={(s) => setStep(s)}
            />
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border-soft bg-bg-1 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-sm border border-border-soft px-3 py-1.5 text-xs text-text-2 hover:border-border-mid hover:bg-bg-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>

          <div className="flex items-center gap-1.5">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                disabled={submitting}
                className="flex items-center gap-1 rounded-sm border border-border-soft px-3 py-1.5 text-xs text-text-2 hover:border-border-mid hover:bg-bg-3 disabled:opacity-40"
              >
                <ChevronLeft size={12} strokeWidth={1.75} />
                Back
              </button>
            )}
            {isFinalStep ? (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || !name.trim()}
                className="flex items-center gap-1.5 rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 size={12} strokeWidth={2} className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Check size={12} strokeWidth={2} />
                    Create agent
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={!canGoNext}
                className="flex items-center gap-1 rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
              >
                Next
                <ChevronRight size={12} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stepper — dots + labels with a progress fill behind them.
// ---------------------------------------------------------------------------

function Stepper({ current }: { current: StepIndex }) {
  const pct = (current / (STEPS.length - 1)) * 100
  return (
    <div className="border-b border-border-soft bg-bg-1 px-5 py-3">
      <div className="relative">
        <div className="absolute left-0 right-0 top-[7px] h-px bg-border-soft" />
        <div
          className="absolute left-0 top-[7px] h-px bg-accent-500 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
        <ol className="relative flex items-start justify-between">
          {STEPS.map((s, i) => {
            const active = i === current
            const done = i < current
            return (
              <li
                key={s.label}
                className="flex min-w-0 flex-col items-center gap-1"
              >
                <span
                  className={[
                    'flex h-[15px] w-[15px] items-center justify-center rounded-full border text-[9px]',
                    active
                      ? 'border-accent-500 bg-accent-500 text-white'
                      : done
                        ? 'border-accent-500 bg-accent-500/80 text-white'
                        : 'border-border-mid bg-bg-2 text-text-4'
                  ].join(' ')}
                  aria-hidden
                >
                  {done ? <Check size={8} strokeWidth={3} /> : null}
                </span>
                <span
                  className={[
                    'font-mono text-[10px] uppercase tracking-wider',
                    active ? 'text-accent-400' : done ? 'text-text-2' : 'text-text-4'
                  ].join(' ')}
                >
                  {s.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Preset
// ---------------------------------------------------------------------------

function PresetStep({
  preset,
  onPick
}: {
  preset: Preset
  onPick: (p: Preset) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-text-3">
        Pick a starter template. It pre-fills identity, soul.md, skills, and
        triggers for the remaining steps — you can still edit each piece.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PRESETS.map((p) => {
          const Icon = p.icon
          const sel = p.id === preset
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              aria-pressed={sel}
              className={[
                'flex items-start gap-3 rounded-sm border p-3 text-left transition',
                sel
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-border-soft bg-bg-1 hover:border-border-mid hover:bg-bg-3'
              ].join(' ')}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm"
                style={{
                  backgroundColor: `${p.color}1f`,
                  color: p.color
                }}
              >
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-text-1">
                  {p.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-text-3">
                  {p.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Identity (with live mini card preview)
// ---------------------------------------------------------------------------

function IdentityStep({
  name,
  role,
  description,
  modelChoice,
  color,
  onName,
  onRole,
  onDescription,
  onModel,
  onColor
}: {
  name: string
  role: string
  description: string
  modelChoice: ModelChoice
  color: string
  onName: (v: string) => void
  onRole: (v: string) => void
  onDescription: (v: string) => void
  onModel: (v: ModelChoice) => void
  onColor: (v: string) => void
}) {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_200px]">
      <div className="space-y-3">
        <div>
          <label className="df-label mb-1.5 block">name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="agent name"
            className="w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 font-mono text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="df-label mb-1.5 block">role</label>
          <input
            type="text"
            value={role}
            onChange={(e) => onRole(e.target.value)}
            placeholder="e.g. code reviewer"
            className="w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="df-label mb-1.5 block">description</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => onDescription(e.target.value)}
            placeholder="what this agent is responsible for"
            className="df-scroll w-full resize-none rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="df-label mb-1.5 block">model</label>
          <select
            value={modelChoice}
            onChange={(e) => onModel(e.target.value as ModelChoice)}
            className="w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 font-mono text-xs text-text-1 focus:border-accent-500 focus:outline-none"
          >
            <option value="inherit">inherit (team default)</option>
            <option value="opus">opus</option>
            <option value="sonnet">sonnet</option>
            <option value="haiku">haiku</option>
          </select>
        </div>
        <div>
          <label className="df-label mb-1.5 block">color</label>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => {
              const sel = c === color
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColor(c)}
                  aria-label={`color ${c}`}
                  aria-pressed={sel}
                  className={`h-6 w-6 rounded-full border transition ${
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

      <div className="flex flex-col items-center gap-2">
        <span className="df-label">preview</span>
        <MiniAgentCard name={name} role={role} color={color} />
      </div>
    </div>
  )
}

/** Compact card-shaped preview. Mirrors AgentCard's anatomy (role line,
 *  name, dashed divider, state dot) without the react-flow handles or
 *  hierarchy badges. Recomputes on every keystroke so the color / name
 *  fields feel live. */
function MiniAgentCard({
  name,
  role,
  color
}: {
  name: string
  role: string
  color: string
}) {
  return (
    <div
      className="w-full rounded-[var(--radius-md)] border border-border-mid bg-[var(--color-bg-2)] font-mono text-[12px]"
      style={{ boxShadow: `0 0 0 2px ${color} inset` }}
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <User size={12} strokeWidth={1.75} className="text-text-3" />
        <span className="truncate text-[11px] uppercase tracking-wider text-text-3">
          {role || 'agent'}
        </span>
      </div>
      <div className="px-3 pb-1 pt-0.5">
        <div className="truncate text-[13px] font-semibold text-text-1">
          {name || '(unnamed)'}
        </div>
      </div>
      <div className="mx-3 my-1 border-t border-dashed border-border-soft" />
      <div className="flex items-center gap-2 px-3 pb-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: 'var(--color-status-idle)' }}
          aria-hidden
        />
        <span className="text-[11px] text-text-2">idle</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Soul.md
// ---------------------------------------------------------------------------

function SoulStep({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}) {
  // Word count is a soft heuristic — split on whitespace and drop empties.
  // Good enough for a guidance pip; not meant to match any particular
  // linter's definition of "word".
  const wordCount = useMemo(() => {
    const trimmed = value.trim()
    if (!trimmed) return 0
    return trimmed.split(/\s+/).length
  }, [value])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-2 text-[11px] leading-relaxed text-text-3">
        <FileText size={12} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent-400" />
        <span>This is the agent&apos;s personality and operating instructions.</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={16}
        placeholder="Describe the agent's role, voice, priorities…"
        className="df-mono-surface df-scroll min-h-[320px] w-full flex-1 resize-y rounded-sm border border-border-mid bg-bg-0 p-3 font-mono text-[12px] leading-relaxed text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
      />
      <div className="flex items-center justify-between text-[10px] text-text-4">
        <span className="font-mono">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
        <span className="font-mono">{value.length} chars</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Skills
// ---------------------------------------------------------------------------

const WEIGHT_MIN = 0.5
const WEIGHT_MAX = 2.0
const WEIGHT_STEP = 0.1
const DEFAULT_WEIGHT = 1.0

function parseTags(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(',')) {
    const t = raw.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function SkillsStep({
  skills,
  onChange
}: {
  skills: Skill[]
  onChange: (s: Skill[]) => void
}) {
  // Mirror of each skill's `tags` as an editable comma-separated string.
  // Kept alongside `skills` so the user can type trailing commas / spaces
  // without losing the draft to a re-parse on every render.
  const [tagDrafts, setTagDrafts] = useState<string[]>(() =>
    skills.map((s) => s.tags.join(', '))
  )

  // Keep drafts in sync if the caller replaces the whole array (e.g. going
  // back to step 1 and picking a different preset). We rebuild when the
  // lengths diverge so legit per-row edits aren't clobbered.
  useEffect(() => {
    if (tagDrafts.length !== skills.length) {
      setTagDrafts(skills.map((s) => s.tags.join(', ')))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills.length])

  const mutate = (i: number, patch: Partial<Skill>, nextDraft?: string): void => {
    const copy = skills.slice()
    const base = copy[i]
    if (!base) return
    copy[i] = { ...base, ...patch }
    onChange(copy)
    if (nextDraft !== undefined) {
      setTagDrafts((prev) => {
        const d = prev.slice()
        d[i] = nextDraft
        return d
      })
    }
  }

  const addSkill = (): void => {
    onChange([
      ...skills,
      { name: '', tags: [], weight: DEFAULT_WEIGHT, description: '' }
    ])
    setTagDrafts((prev) => [...prev, ''])
  }

  const removeSkill = (i: number): void => {
    onChange(skills.filter((_, idx) => idx !== i))
    setTagDrafts((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-text-3">
          Skills boost routing scores when a task tag matches. Weight is{' '}
          <code className="font-mono text-[10px]">0.5x – 2.0x</code>.
        </p>
        <span className="font-mono text-[10px] text-text-4">
          {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
        </span>
      </div>

      {skills.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border-soft bg-bg-1 p-6 text-center text-[11px] text-text-3">
          No skills yet. Add one below or go back to pick a preset with a bundle.
        </div>
      ) : (
        <ul className="space-y-2">
          {skills.map((skill, i) => (
            <li
              key={i}
              className="space-y-2 rounded-sm border border-border-soft bg-bg-1 p-2.5"
            >
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={skill.name}
                  onChange={(e) => mutate(i, { name: e.target.value })}
                  placeholder="skill name (e.g. go-review)"
                  className="flex-1 rounded-sm border border-border-mid bg-bg-2 px-2 py-1 font-mono text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeSkill(i)}
                  aria-label={`delete skill ${skill.name || i + 1}`}
                  className="rounded-sm border border-border-soft bg-bg-2 p-1 text-text-3 hover:border-border-mid hover:text-red-400"
                  title="delete skill"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                </button>
              </div>

              <div>
                <label className="df-label mb-1 block">tags (comma-separated)</label>
                <input
                  type="text"
                  value={tagDrafts[i] ?? ''}
                  onChange={(e) => {
                    const draft = e.target.value
                    mutate(i, { tags: parseTags(draft) }, draft)
                  }}
                  placeholder="review, backend, go"
                  className="w-full rounded-sm border border-border-mid bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="df-label">weight</label>
                  <span className="font-mono text-[10px] text-text-3">
                    {skill.weight.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={WEIGHT_MIN}
                  max={WEIGHT_MAX}
                  step={WEIGHT_STEP}
                  value={skill.weight}
                  onChange={(e) =>
                    mutate(i, { weight: Number.parseFloat(e.target.value) })
                  }
                  className="w-full accent-accent-500"
                  aria-label={`weight for ${skill.name || 'skill'}`}
                />
              </div>

              <div>
                <label className="df-label mb-1 block">description (optional)</label>
                <input
                  type="text"
                  value={skill.description ?? ''}
                  onChange={(e) => mutate(i, { description: e.target.value })}
                  placeholder="one-line hint for the router / humans"
                  className="w-full rounded-sm border border-border-mid bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addSkill}
        className="flex items-center gap-1.5 rounded-sm border border-dashed border-border-mid bg-bg-1 px-3 py-2 text-xs text-text-2 transition hover:border-accent-500 hover:text-text-1"
      >
        <Plus size={12} strokeWidth={1.75} />
        Add skill
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5 — Triggers
// ---------------------------------------------------------------------------

function TriggersStep({
  triggers,
  onChange
}: {
  triggers: Trigger[]
  onChange: (t: Trigger[]) => void
}) {
  const update = (id: string, patch: Partial<Trigger>): void => {
    onChange(triggers.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  const remove = (id: string): void => {
    onChange(triggers.filter((t) => t.id !== id))
  }
  const add = (): void => {
    onChange([
      ...triggers,
      {
        id: genTriggerId(),
        kind: 'tag',
        pattern: '',
        priority: 10,
        enabled: true
      }
    ])
  }
  const changeKind = (id: string, kind: TriggerKind): void => {
    // Reset pattern so the kind-specific placeholder surfaces cleanly.
    onChange(
      triggers.map((t) => (t.id === id ? { ...t, kind, pattern: '' } : t))
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-text-3">
        Triggers define when the agent runs. Manual at priority 0 is always
        present so @mentions keep working.
      </p>

      <ul className="space-y-2">
        {triggers.map((t) => {
          const isManualZero = t.kind === 'manual' && t.priority === 0
          return (
            <li
              key={t.id}
              className="rounded-sm border border-border-soft bg-bg-1 p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={t.kind}
                  disabled={isManualZero}
                  onChange={(e) => changeKind(t.id, e.target.value as TriggerKind)}
                  className="rounded-sm border border-border-mid bg-bg-2 px-1.5 py-1 font-mono text-[11px] text-text-1 focus:border-accent-500 focus:outline-none disabled:opacity-50"
                >
                  {TRIGGER_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={t.pattern}
                  disabled={isManualZero || t.kind === 'manual'}
                  onChange={(e) => update(t.id, { pattern: e.target.value })}
                  placeholder={TRIGGER_PLACEHOLDERS[t.kind]}
                  className="min-w-[140px] flex-1 rounded-sm border border-border-mid bg-bg-2 px-2 py-1 font-mono text-[11px] text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none disabled:opacity-50"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={t.priority}
                  disabled={isManualZero}
                  onChange={(e) => {
                    const raw = Number(e.target.value)
                    const clamped = Number.isFinite(raw)
                      ? Math.max(0, Math.min(100, Math.trunc(raw)))
                      : 0
                    update(t.id, { priority: clamped })
                  }}
                  title="priority (0–100)"
                  className="w-14 rounded-sm border border-border-mid bg-bg-2 px-1.5 py-1 text-center font-mono text-[11px] text-text-1 focus:border-accent-500 focus:outline-none disabled:opacity-50"
                />
                <label
                  className="flex items-center gap-1 rounded-sm border border-border-soft bg-bg-2 px-1.5 py-1 text-[10px] text-text-3"
                  title="enabled"
                >
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    disabled={isManualZero}
                    onChange={(e) => update(t.id, { enabled: e.target.checked })}
                    className="h-3 w-3 accent-accent-500"
                  />
                  <span className="df-label">on</span>
                </label>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={isManualZero}
                  aria-label="delete trigger"
                  title={isManualZero ? 'manual@0 is required' : 'delete'}
                  className="rounded-sm border border-border-soft bg-bg-2 p-1 text-text-3 hover:border-red-500/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                </button>
              </div>
              {isManualZero && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-text-4">
                  <AlertCircle size={10} strokeWidth={1.75} />
                  <span>
                    Manual at priority 0 is always present (locked so @mentions
                    keep routing to this agent).
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 rounded-sm border border-dashed border-border-mid bg-bg-1 px-3 py-2 text-xs text-text-2 transition hover:border-accent-500 hover:text-text-1"
      >
        <Plus size={12} strokeWidth={1.75} />
        Add trigger
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 6 — Review
// ---------------------------------------------------------------------------

function ReviewStep({
  preset,
  name,
  role,
  description,
  modelChoice,
  color,
  soul,
  skills,
  triggers,
  onJumpTo
}: {
  preset: Preset
  name: string
  role: string
  description: string
  modelChoice: ModelChoice
  color: string
  soul: string
  skills: Skill[]
  triggers: Trigger[]
  onJumpTo: (step: StepIndex) => void
}) {
  const modelLabel =
    modelChoice === 'inherit' ? 'inherit (team default)' : modelChoice
  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-text-3">
        Double-check the summary below. Click any section to jump back and
        edit. Hit <span className="font-semibold text-text-1">Create agent</span> when ready.
      </p>

      <ReviewSection label="Preset" onEdit={() => onJumpTo(0)}>
        <span className="font-mono text-[12px] text-text-1">
          {findPreset(preset).label}
        </span>
      </ReviewSection>

      <ReviewSection label="Identity" onEdit={() => onJumpTo(1)}>
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="font-mono text-[12px] text-text-1">{name || '(unnamed)'}</div>
            <div className="text-[11px] text-text-3">
              {role || '(no role)'} · <span className="font-mono">{modelLabel}</span>
            </div>
            {description ? (
              <div className="text-[11px] text-text-3">{description}</div>
            ) : null}
          </div>
        </div>
      </ReviewSection>

      <ReviewSection label="Soul.md" onEdit={() => onJumpTo(2)}>
        <pre className="df-scroll max-h-32 overflow-auto whitespace-pre-wrap rounded-sm border border-border-soft bg-bg-0 p-2 font-mono text-[11px] leading-relaxed text-text-2">
          {soul.trim() || '(empty)'}
        </pre>
      </ReviewSection>

      <ReviewSection
        label={`Skills (${skills.length})`}
        onEdit={() => onJumpTo(3)}
      >
        {skills.length === 0 ? (
          <span className="text-[11px] text-text-4">no skills</span>
        ) : (
          <ul className="space-y-1">
            {skills.map((s, i) => (
              <li
                key={i}
                className="flex items-center gap-2 font-mono text-[11px] text-text-2"
              >
                <Zap size={10} strokeWidth={1.75} className="text-accent-400" />
                <span className="text-text-1">{s.name || '(unnamed)'}</span>
                <span className="text-text-4">{s.weight.toFixed(1)}x</span>
                {s.tags.length > 0 && (
                  <span className="text-text-4">[{s.tags.join(', ')}]</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </ReviewSection>

      <ReviewSection
        label={`Triggers (${triggers.length})`}
        onEdit={() => onJumpTo(4)}
      >
        <ul className="space-y-1">
          {triggers.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 font-mono text-[11px]"
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${t.enabled ? 'bg-accent-500' : 'bg-border-mid'}`}
                aria-hidden
              />
              <span className="text-text-1">{t.kind}</span>
              {t.pattern ? (
                <span className="text-text-3">{t.pattern}</span>
              ) : null}
              <span className="ml-auto text-text-4">p{t.priority}</span>
            </li>
          ))}
        </ul>
      </ReviewSection>
    </div>
  )
}

function ReviewSection({
  label,
  children,
  onEdit
}: {
  label: string
  children: React.ReactNode
  onEdit: () => void
}) {
  return (
    <section className="rounded-sm border border-border-soft bg-bg-1">
      <header className="flex items-center justify-between border-b border-border-soft px-2.5 py-1.5">
        <span className="df-label">{label}</span>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-sm px-1.5 py-0.5 text-[10px] text-accent-400 hover:bg-accent-500/10 hover:text-accent-400"
        >
          edit
        </button>
      </header>
      <div className="p-2.5">{children}</div>
    </section>
  )
}
