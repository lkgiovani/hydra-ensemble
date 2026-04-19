import { useEffect, useState } from 'react'
import { useWatchdog } from '../../state/watchdog'
import type { WatchdogRule } from '../../../shared/types'

type Action = WatchdogRule['action']

interface FormState {
  id: string
  name: string
  enabled: boolean
  triggerPattern: string
  action: Action
  payload: string
  cooldownMs: number
}

const EMPTY: FormState = {
  id: '',
  name: '',
  enabled: true,
  triggerPattern: '',
  action: 'notify',
  payload: '',
  cooldownMs: 5_000
}

const newId = (): string =>
  `wd-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`

export default function RuleDialog() {
  const editingId = useWatchdog((s) => s.editingId)
  const rules = useWatchdog((s) => s.rules)
  const cancel = useWatchdog((s) => s.cancelEdit)
  const upsert = useWatchdog((s) => s.upsert)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingId === null) return
    if (editingId === 'new') {
      setForm({ ...EMPTY, id: newId() })
    } else {
      const rule = rules.find((r) => r.id === editingId)
      if (!rule) {
        cancel()
        return
      }
      setForm({
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        triggerPattern: rule.triggerPattern,
        action: rule.action,
        payload: rule.payload ?? '',
        cooldownMs: rule.cooldownMs
      })
    }
    setError(null)
  }, [editingId, rules, cancel])

  if (editingId === null) return null

  const validateRegex = (pattern: string): string | null => {
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern)
      return null
    } catch (err) {
      return (err as Error).message
    }
  }

  const onSave = async (): Promise<void> => {
    if (!form.name.trim()) return setError('name is required')
    if (!form.triggerPattern) return setError('regex is required')
    const re = validateRegex(form.triggerPattern)
    if (re) return setError(`invalid regex: ${re}`)
    if (form.cooldownMs < 0) return setError('cooldown must be >= 0')

    const rule: WatchdogRule = {
      id: form.id,
      name: form.name.trim(),
      enabled: form.enabled,
      triggerPattern: form.triggerPattern,
      action: form.action,
      cooldownMs: Math.floor(form.cooldownMs)
    }
    if (form.action === 'sendInput' && form.payload) rule.payload = form.payload
    await upsert(rule)
    cancel()
  }

  const regexErr = form.triggerPattern ? validateRegex(form.triggerPattern) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex w-[34rem] max-w-[90vw] flex-col gap-3 rounded-lg border border-white/10 bg-[#16161a] p-4 text-sm text-white shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">
            {editingId === 'new' ? 'New watchdog rule' : 'Edit watchdog rule'}
          </h2>
          <button
            type="button"
            onClick={cancel}
            className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
        <Field label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="auto-accept y prompt"
            className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
          />
        </Field>
        <Field label="Regex">
          <input
            type="text"
            value={form.triggerPattern}
            onChange={(e) => setForm({ ...form, triggerPattern: e.target.value })}
            placeholder="Continue\?"
            spellCheck={false}
            className={`w-full rounded border bg-black/40 px-2 py-1 font-mono text-xs ${
              regexErr ? 'border-red-400/60' : 'border-white/10'
            }`}
          />
          {regexErr && <span className="text-[11px] text-red-400">{regexErr}</span>}
        </Field>
        <Field label="Action">
          <select
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value as Action })}
            className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
          >
            <option value="notify">notify</option>
            <option value="sendInput">sendInput</option>
            <option value="kill">kill</option>
          </select>
        </Field>
        {form.action === 'sendInput' && (
          <Field label="Payload">
            <input
              type="text"
              value={form.payload}
              onChange={(e) => setForm({ ...form, payload: e.target.value })}
              placeholder={'y\\r'}
              className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs"
            />
            <span className="text-[11px] text-white/40">
              sent verbatim (use \r for enter)
            </span>
          </Field>
        )}
        <Field label="Cooldown (ms)">
          <input
            type="number"
            min={0}
            value={form.cooldownMs}
            onChange={(e) => setForm({ ...form, cooldownMs: Number(e.target.value) || 0 })}
            className="w-32 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
          />
        </Field>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          enabled
        </label>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="rounded px-3 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            className="rounded bg-emerald-500/30 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/50"
          >
            save
          </button>
        </div>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  children: React.ReactNode
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/70">
      <span className="text-[11px] uppercase tracking-wide text-white/40">{label}</span>
      {children}
    </label>
  )
}
