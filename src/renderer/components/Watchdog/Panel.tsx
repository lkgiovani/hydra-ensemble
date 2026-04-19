import { useEffect } from 'react'
import { useWatchdog } from '../../state/watchdog'
import RuleDialog from './RuleDialog'
import type { WatchdogRule } from '../../../shared/types'

export default function WatchdogPanel() {
  const open = useWatchdog((s) => s.panelOpen)
  const close = useWatchdog((s) => s.closePanel)
  const rules = useWatchdog((s) => s.rules)
  const log = useWatchdog((s) => s.log)
  const init = useWatchdog((s) => s.init)
  const toggle = useWatchdog((s) => s.toggle)
  const remove = useWatchdog((s) => s.remove)
  const startEdit = useWatchdog((s) => s.startEdit)
  const editingId = useWatchdog((s) => s.editingId)

  useEffect(() => {
    void init()
  }, [init])

  if (!open) return <RuleDialog />

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={close} aria-hidden />
      <aside className="fixed right-0 top-0 z-30 flex h-full w-[28rem] max-w-[95vw] flex-col border-l border-white/10 bg-[#16161a] text-sm text-white shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-medium">Watchdogs</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startEdit('new')}
              className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/30"
            >
              + rule
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rules.length === 0 && (
            <div className="p-4 text-xs text-white/40">
              no rules yet — click <span className="text-white/70">+ rule</span> to add one.
            </div>
          )}
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onToggle={() => void toggle(rule.id)}
              onEdit={() => startEdit(rule.id)}
              onRemove={() => void remove(rule.id)}
            />
          ))}
        </div>
        {log.length > 0 && (
          <div className="border-t border-white/10 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">
              recent fires
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {log.slice(0, 30).map((entry, idx) => (
                <li key={`${entry.ruleId}-${entry.at}-${idx}`} className="text-white/70">
                  <span className="text-white/40">
                    {new Date(entry.at).toLocaleTimeString()}
                  </span>{' '}
                  <span className="text-emerald-300">{entry.ruleName}</span>{' '}
                  <span className="text-white/50">→ {entry.matched}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      <RuleDialog />
      {editingId !== null && (
        // RuleDialog manages its own visibility, this is just to silence
        // an unused-var warning when editingId is set without affecting rules.
        <></>
      )}
    </>
  )
}

interface RowProps {
  rule: WatchdogRule
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}

function RuleRow({ rule, onToggle, onEdit, onRemove }: RowProps) {
  return (
    <div className="border-b border-white/5 px-4 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={`h-4 w-7 rounded-full transition ${
            rule.enabled ? 'bg-emerald-500/70' : 'bg-white/15'
          }`}
          title={rule.enabled ? 'disable' : 'enable'}
          aria-pressed={rule.enabled}
        >
          <span
            className={`block h-3 w-3 translate-y-0.5 rounded-full bg-white transition ${
              rule.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{rule.name}</div>
          <div className="truncate font-mono text-[11px] text-white/50">
            /{rule.triggerPattern}/ → {rule.action}
            {rule.action === 'sendInput' && rule.payload ? ` "${rule.payload}"` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded px-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
        >
          edit
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-1 text-xs text-white/40 hover:bg-white/10 hover:text-red-300"
        >
          ×
        </button>
      </div>
    </div>
  )
}
