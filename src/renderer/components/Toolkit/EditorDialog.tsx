import { useEffect, useState } from 'react'
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
      if (!id) return setError('every item needs an id')
      if (!label) return setError(`item "${id}" needs a label`)
      if (!command) return setError(`item "${id}" needs a command`)
      if (seenIds.has(id)) return setError(`duplicate id: ${id}`)
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

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="flex w-[42rem] max-w-[90vw] flex-col gap-3 rounded-lg border border-white/10 bg-[#16161a] p-4 text-sm text-white shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Toolkit items</h2>
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[8rem_8rem_1fr_2rem] gap-2 text-xs text-white/40">
            <span>id</span>
            <span>label</span>
            <span>command</span>
            <span />
          </div>
          {drafts.length === 0 && (
            <div className="rounded border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
              no items yet
            </div>
          )}
          {drafts.map((row) => (
            <div key={row._key} className="grid grid-cols-[8rem_8rem_1fr_2rem] gap-2">
              <input
                type="text"
                value={row.id}
                onChange={(e) => updateRow(row._key, { id: e.target.value })}
                placeholder="test"
                className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={row.label}
                onChange={(e) => updateRow(row._key, { label: e.target.value })}
                placeholder="test"
                className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={row.command}
                onChange={(e) => updateRow(row._key, { command: e.target.value })}
                placeholder="npm test"
                className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => removeRow(row._key)}
                className="rounded text-white/40 hover:bg-white/10 hover:text-red-300"
                title="remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={addRow}
            className="rounded bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          >
            + add item
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
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
    </div>
  )
}
