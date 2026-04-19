import { useEffect, useState } from 'react'
import { AlertCircle, GripVertical, Plus, Wrench, X } from 'lucide-react'
import { useToolkit } from '../../state/toolkit'
import type { ToolkitItem } from '../../../shared/types'

interface DraftItem extends ToolkitItem {
  /** Local-only id used for keying new rows that haven't been saved. */
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

  useEffect(() => {
    if (!open) return
    setDrafts(items.map((i) => ({ ...i, _key: i.id || localKey() })))
    setError(null)
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
    // Validate: ids must be unique + non-empty, labels & commands non-empty.
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
    const cleaned: ToolkitItem[] = drafts.map((r) => ({
      id: r.id.trim(),
      label: r.label.trim(),
      command: r.command.trim(),
      ...(r.icon ? { icon: r.icon } : {})
    }))
    await save(cleaned)
    close()
  }

  const inputCls =
    'w-full rounded-md border border-border-mid bg-bg-3 px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-4 focus-within:border-accent-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/85 p-6 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="df-fade-in flex max-h-[90vh] w-[44rem] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border-mid bg-bg-2 shadow-pop">
        <header className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Wrench size={16} strokeWidth={1.75} className="text-text-2" />
            <h2 className="text-sm font-semibold text-text-1">Toolkit items</h2>
            <span className="text-xs text-text-4">
              {drafts.length} {drafts.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="df-scroll flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1.25rem_8rem_8rem_1fr_1.75rem] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-text-4">
              <span />
              <span>Id</span>
              <span>Label</span>
              <span>Command</span>
              <span />
            </div>
            {drafts.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-soft py-10">
                <Wrench size={28} strokeWidth={1.25} className="text-text-4" />
                <div className="text-sm text-text-2">No toolkit items yet</div>
                <div className="text-xs text-text-4">
                  Add a row below to wire up a one-click command.
                </div>
              </div>
            )}
            {drafts.map((row) => (
              <div
                key={row._key}
                className="grid grid-cols-[1.25rem_8rem_8rem_1fr_1.75rem] items-center gap-2"
              >
                <span
                  className="cursor-grab text-text-4 hover:text-text-2"
                  title="Reorder (drag — coming soon)"
                  aria-hidden
                >
                  <GripVertical size={14} strokeWidth={1.5} />
                </span>
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
                  className={`${inputCls} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(row._key)}
                  className="rounded-md p-1 text-text-3 hover:bg-bg-3 hover:text-status-attention"
                  title="Remove"
                  aria-label="Remove item"
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border-mid bg-bg-2 px-3 py-2 text-xs text-text-3 hover:border-border-hard hover:bg-bg-3 hover:text-text-1"
            >
              <Plus size={13} strokeWidth={2} />
              Add toolkit item
            </button>
          </div>
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
              onClick={close}
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
