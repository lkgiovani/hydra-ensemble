import { useEffect } from 'react'
import {
  Bell,
  Edit3,
  Plus,
  Square,
  Terminal,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import { useWatchdog } from '../../state/watchdog'
import RuleDialog from './RuleDialog'
import type { WatchdogRule } from '../../../shared/types'

function ActionIcon({ action }: { action: WatchdogRule['action'] }) {
  if (action === 'sendInput') return <Terminal size={11} strokeWidth={1.75} />
  if (action === 'kill') return <Square size={11} strokeWidth={1.75} />
  return <Bell size={11} strokeWidth={1.75} />
}

export default function WatchdogPanel() {
  const open = useWatchdog((s) => s.panelOpen)
  const close = useWatchdog((s) => s.closePanel)
  const rules = useWatchdog((s) => s.rules)
  const log = useWatchdog((s) => s.log)
  const init = useWatchdog((s) => s.init)
  const toggle = useWatchdog((s) => s.toggle)
  const remove = useWatchdog((s) => s.remove)
  const startEdit = useWatchdog((s) => s.startEdit)

  useEffect(() => {
    void init()
  }, [init])

  if (!open) return <RuleDialog />

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-bg-0/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      <aside className="df-slide-in fixed right-0 top-0 z-30 flex h-full w-[480px] max-w-[95vw] flex-col border-l border-border-mid bg-bg-2 text-sm text-text-1 shadow-card">
        <header className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Zap size={16} strokeWidth={1.75} className="text-text-2" />
            <h2 className="text-sm font-semibold text-text-1">Watchdogs</h2>
            <span className="text-xs text-text-4">{rules.length}</span>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="Close panel"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="df-scroll flex-1 overflow-y-auto">
          {rules.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <Zap size={32} strokeWidth={1.25} className="text-text-4" />
              <div className="text-sm text-text-2">No watchdog rules</div>
              <div className="text-xs text-text-4">
                Create a rule to react automatically to PTY output.
              </div>
              <button
                type="button"
                onClick={() => startEdit('new')}
                className="mt-2 flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600"
              >
                <Plus size={13} strokeWidth={2} />
                New rule
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1.5 p-3">
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
            <div className="border-t border-border-soft p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-4">
                <Bell size={10} strokeWidth={1.75} />
                Recent fires
              </div>
              <ul className="df-scroll max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
                {log.slice(0, 30).map((entry, idx) => (
                  <li
                    key={`${entry.ruleId}-${entry.at}-${idx}`}
                    className="flex items-start gap-2 rounded-md px-2 py-1 text-text-2 hover:bg-bg-3"
                  >
                    <span className="font-mono text-[10px] text-text-4">
                      {new Date(entry.at).toLocaleTimeString()}
                    </span>
                    <span className="font-medium text-status-generating">
                      {entry.ruleName}
                    </span>
                    <span className="truncate text-text-3">→ {entry.matched}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {rules.length > 0 && (
          <footer className="border-t border-border-soft p-3">
            <button
              type="button"
              onClick={() => startEdit('new')}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border-mid bg-bg-2 px-3 py-2 text-sm text-text-3 hover:border-border-hard hover:bg-bg-3 hover:text-text-1"
            >
              <Plus size={14} strokeWidth={2} />
              New rule
            </button>
          </footer>
        )}
      </aside>
      <RuleDialog />
    </>
  )
}

interface RowProps {
  rule: WatchdogRule
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}

function actionStyles(action: WatchdogRule['action']): string {
  if (action === 'sendInput') return 'bg-status-input/15 text-status-input'
  if (action === 'kill') return 'bg-status-attention/15 text-status-attention'
  return 'bg-bg-4 text-text-2'
}

function RuleRow({ rule, onToggle, onEdit, onRemove }: RowProps) {
  return (
    <div className="df-lift group flex items-center gap-3 rounded-md border border-border-soft bg-bg-3 px-3 py-2.5 hover:border-border-mid hover:bg-bg-4">
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={onToggle}
          className="peer sr-only"
          aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
        />
        <span className="block h-4 w-7 rounded-full bg-bg-5 transition peer-checked:bg-accent-500" />
        <span className="absolute left-0.5 top-0.5 block h-3 w-3 rounded-full bg-text-1 transition peer-checked:translate-x-3" />
      </label>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm text-text-1">{rule.name}</div>
          <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${actionStyles(
              rule.action
            )}`}
          >
            <ActionIcon action={rule.action} />
            {rule.action}
          </span>
        </div>
        <div
          className="mt-0.5 truncate font-mono text-xs text-text-3"
          title={rule.triggerPattern}
        >
          /{rule.triggerPattern}/
          {rule.action === 'sendInput' && rule.payload ? (
            <span className="text-text-4"> → "{rule.payload}"</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
          title="Edit"
          aria-label="Edit rule"
        >
          <Edit3 size={13} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-status-attention"
          title="Delete"
          aria-label="Delete rule"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
