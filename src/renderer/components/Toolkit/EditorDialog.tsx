import { useEffect, useState } from 'react'
import { AlertCircle, GripVertical, Plus, Wrench, X } from 'lucide-react'
import { useToolkit } from '../../state/toolkit'
import type { ToolkitItem } from '../../../shared/types'
import { TOOLKIT_ICON_NAMES, ToolkitIcon, guessIconForLabel } from '../../lib/toolkit-icons'
import { AGENT_COLORS, hexAlpha } from '../../lib/agent'

interface DraftItem extends ToolkitItem {
  _key: string
}

let _seq = 0
const localKey = (): string => `draft-${++_seq}-${Date.now().toString(36)}`

export default function EditorDialog() {
  const open = useToolkit((s) => s.editorOpen)
  const items = useToolkit((s) => s.items)
  const close = useToolkit((s) => s.closeEditor)
  const save = useToolkit((s) => s.save)

  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDrafts(items.map((i) => ({ ...i, _key: i.id || localKey() })))
    setError(null)
    setPickerFor(null)
  }, [open, items])

  if (!open) return null

  const updateRow = (key: string, patch: Partial<ToolkitItem>): void => {
    setDrafts((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }

  const removeRow = (key: string): void => {
    setDrafts((rows) => rows.filter((r) => r._key !== key))
  }

  const addRow = (): void => {
    setDrafts((rows) => [
      ...rows,
      { _key: localKey(), id: '', label: '', command: '' }
    ])
  }

  const onSave = async (): Promise<void> => {
    const seenIds = new Set<string>()
    for (const row of drafts) {
      const id = row.id.trim()
      const label = row.label.trim()
      const command = row.command.trim()
      if (!id) return setError('Every item needs an id')
      if (!label) return setError(`Item "${id}" needs a label`)
      if (!command) return setError(`Item "${id}" needs a command`)
      if (seenIds.has(id)) return setError(`Duplicate id: ${id}`)
      seenIds.add(id)
    }
    const cleaned: ToolkitItem[] = drafts.map((r) => {
      const item: ToolkitItem = {
        id: r.id.trim(),
        label: r.label.trim(),
        command: r.command.trim()
      }
      if (r.icon) item.icon = r.icon
      if (r.accent) item.accent = r.accent
      if (r.group?.trim()) item.group = r.group.trim()
      return item
    })
    await save(cleaned)
    close()
  }

  const inputCls =
    'w-full rounded-sm border border-border-mid bg-bg-1 px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-4 focus:border-accent-500 focus:outline-none'
  const inputMonoCls = `${inputCls} font-mono`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/85 p-6 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="df-fade-in flex max-h-[90vh] w-[52rem] max-w-[95vw] flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border-soft bg-bg-1 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Wrench size={14} strokeWidth={1.75} className="text-accent-400" />
            <span className="df-label">toolkit</span>
            <span className="font-mono text-[10px] text-text-4">
              {drafts.length} {drafts.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-sm p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>

        <div className="df-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1.25rem_2.25rem_7rem_8rem_1fr_5rem_1.5rem] items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-text-4">
              <span />
              <span>icon</span>
              <span>id</span>
              <span>label</span>
              <span>command</span>
              <span>group</span>
              <span />
            </div>
            {drafts.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border-soft py-10">
                <Wrench size={28} strokeWidth={1.25} className="text-text-4" />
                <div className="text-sm text-text-2">No toolkit items yet</div>
                <div className="text-xs text-text-4">
                  Add a row below to wire up a one-click command.
                </div>
              </div>
            )}
            {drafts.map((row) => {
              const iconName = row.icon ?? guessIconForLabel(row.label || row.id)
              const accent = row.accent ?? '#ff6b4d'
              return (
                <div
                  key={row._key}
                  className="grid grid-cols-[1.25rem_2.25rem_7rem_8rem_1fr_5rem_1.5rem] items-center gap-2"
                >
                  <span
                    className="cursor-grab text-text-4 hover:text-text-2"
                    title="reorder (drag — coming soon)"
                    aria-hidden
                  >
                    <GripVertical size={14} strokeWidth={1.5} />
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerFor(pickerFor === row._key ? null : row._key)}
                    className="flex h-7 w-7 items-center justify-center rounded-sm border border-border-soft hover:border-border-mid"
                    style={{
                      backgroundColor: hexAlpha(accent, 0.15),
                      color: accent
                    }}
                    title="pick icon + accent"
                    aria-label="pick icon"
                  >
                    <ToolkitIcon name={iconName} size={13} />
                  </button>
                  <input
                    type="text"
                    value={row.id}
                    onChange={(e) => updateRow(row._key, { id: e.target.value })}
                    placeholder="test"
                    className={inputCls}
                  />
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateRow(row._key, { label: e.target.value })}
                    placeholder="Test"
                    className={inputCls}
                  />
                  <input
                    type="text"
                    value={row.command}
                    onChange={(e) => updateRow(row._key, { command: e.target.value })}
                    placeholder="npm test"
                    className={inputMonoCls}
                  />
                  <input
                    type="text"
                    value={row.group ?? ''}
                    onChange={(e) => updateRow(row._key, { group: e.target.value })}
                    placeholder="verify"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row._key)}
                    className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-status-attention"
                    title="remove"
                    aria-label="remove item"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                  {pickerFor === row._key ? (
                    <div className="col-span-7 mt-0.5 flex flex-col gap-2 rounded-sm border border-border-soft bg-bg-1 p-2.5">
                      <div>
                        <div className="df-label mb-1.5">icon</div>
                        <div className="grid grid-cols-12 gap-1">
                          {TOOLKIT_ICON_NAMES.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => updateRow(row._key, { icon: n })}
                              className={`flex h-7 items-center justify-center rounded-sm transition ${
                                (row.icon ?? guessIconForLabel(row.label || row.id)) === n
                                  ? 'bg-accent-500/20 ring-1 ring-inset ring-accent-500'
                                  : 'hover:bg-bg-3 text-text-3'
                              }`}
                              title={n}
                            >
                              <ToolkitIcon name={n} size={13} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="df-label mb-1.5">accent</div>
                        <div className="grid grid-cols-8 gap-1">
                          {AGENT_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => updateRow(row._key, { accent: c })}
                              className={`h-6 rounded-sm transition ${
                                (row.accent ?? '#ff6b4d') === c
                                  ? 'ring-2 ring-text-1 ring-offset-2 ring-offset-bg-1'
                                  : ''
                              }`}
                              style={{ backgroundColor: c }}
                              aria-label={`accent ${c}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
            <button
              type="button"
              onClick={addRow}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-mid bg-bg-2 px-3 py-2 text-xs text-text-3 hover:border-border-hard hover:bg-bg-3 hover:text-text-1"
            >
              <Plus size={13} strokeWidth={2} />
              Add toolkit item
            </button>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border-soft bg-bg-1 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            {error && (
              <div className="flex items-start gap-1.5 rounded-sm border border-status-attention/30 bg-status-attention/10 px-2.5 py-1.5 text-xs text-status-attention">
                <AlertCircle size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={close}
              className="rounded-sm border border-border-soft px-3 py-1.5 text-xs text-text-2 hover:border-border-mid hover:bg-bg-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              className="rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600"
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
