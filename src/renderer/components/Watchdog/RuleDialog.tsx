import { useEffect, useState } from 'react'
import { AlertCircle, Check, X, Zap } from 'lucide-react'
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
    if (!form.name.trim()) return setError('Name is required')
    if (!form.triggerPattern) return setError('Regex is required')
    const re = validateRegex(form.triggerPattern)
    if (re) return setError(`Invalid regex: ${re}`)
    if (form.cooldownMs < 0) return setError('Cooldown must be >= 0')

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
  const regexOk = !!form.triggerPattern && !regexErr

  const inputCls =
    'w-full rounded-md border border-border-mid bg-bg-3 px-2.5 py-1.5 text-sm text-text-1 placeholder:text-text-4 focus-within:border-accent-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/85 p-6 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel()
      }}
    >
      <div className="df-fade-in flex max-h-[90vh] w-[36rem] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border-mid bg-bg-2 shadow-pop">
        <header className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Zap size={16} strokeWidth={1.75} className="text-text-2" />
            <h2 className="text-sm font-semibold text-text-1">
              {editingId === 'new' ? 'New watchdog rule' : 'Edit watchdog rule'}
            </h2>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="df-scroll flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <Field label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="auto-accept y prompt"
              className={inputCls}
            />
          </Field>

          <Field label="Regex">
            <div
              className={`flex items-center gap-2 rounded-md border bg-bg-3 px-2.5 py-1.5 ${
                regexErr
                  ? 'border-status-attention/50'
                  : regexOk
                    ? 'border-status-generating/40'
                    : 'border-border-mid'
              } focus-within:border-accent-500`}
            >
              <input
                type="text"
                value={form.triggerPattern}
                onChange={(e) => setForm({ ...form, triggerPattern: e.target.value })}
                placeholder="Continue\?"
                spellCheck={false}
                className="flex-1 bg-transparent font-mono text-sm text-text-1 placeholder:text-text-4 focus:outline-none"
              />
              {regexOk && (
                <Check
                  size={14}
                  strokeWidth={2}
                  className="shrink-0 text-status-generating"
                />
              )}
              {regexErr && (
                <AlertCircle
                  size={14}
                  strokeWidth={1.75}
                  className="shrink-0 text-status-attention"
                />
              )}
            </div>
            {regexErr && (
              <span className="text-[11px] text-status-attention">{regexErr}</span>
            )}
          </Field>

          <Field label="Action">
            <select
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value as Action })}
              className={inputCls}
            >
              <option value="notify">notify</option>
              <option value="sendInput">sendInput</option>
              <option value="kill">kill</option>
            </select>
          </Field>

          {form.action === 'sendInput' && (
            <Field label="Payload">
              <textarea
                value={form.payload}
                onChange={(e) => setForm({ ...form, payload: e.target.value })}
                placeholder={'y\\r'}
                rows={2}
                className={`${inputCls} font-mono`}
              />
              <span className="text-[11px] text-text-4">
                Sent verbatim — use <code className="font-mono">\r</code> for Enter.
              </span>
            </Field>
          )}

          <Field label="Cooldown (ms)">
            <input
              type="number"
              min={0}
              value={form.cooldownMs}
              onChange={(e) =>
                setForm({ ...form, cooldownMs: Number(e.target.value) || 0 })
              }
              className={`${inputCls} w-40`}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-text-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-accent-500"
            />
            Enabled
          </label>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border-soft bg-bg-2 px-5 py-3">
          <div className="min-w-0 flex-1">
            {error && (
              <div className="flex items-start gap-1.5 rounded-md border border-status-attention/30 bg-status-attention/10 px-2.5 py-1.5 text-xs text-status-attention">
                <AlertCircle size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cancel}
              className="rounded-md px-3 py-1.5 text-sm text-text-3 hover:bg-bg-3 hover:text-text-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              className="flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600"
            >
              Save
            </button>
          </div>
        </footer>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-4">
        {label}
      </span>
      {children}
    </label>
  )
}
