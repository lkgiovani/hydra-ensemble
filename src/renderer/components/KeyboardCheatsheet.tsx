import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Search, X } from 'lucide-react'
import { ACTIONS, allBindings, useKeybinds } from '../state/keybinds'
import { formatCombo } from '../lib/keybind'

interface Props {
  open: boolean
  onClose: () => void
}

interface Row {
  label: string
  combo: string
}

interface Section {
  title: string
  rows: Row[]
}

/**
 * Group buckets we care about in the cheatsheet. Everything else from the
 * dynamic ACTIONS registry lands under "Panels" by default since that's
 * the umbrella we use for overlays/drawers. The static block at the bottom
 * covers Orchestra-level shortcuts that are handled outside ACTIONS.
 */
const GROUP_ORDER = ['Navigation', 'Panels', 'Sessions', 'Editor', 'Orchestra'] as const

/**
 * Actions from ACTIONS are grouped by `action.group`. These overrides let
 * us reassign a few entries into the five buckets we show in the overlay
 * without mutating the source of truth in keybinds.ts.
 */
const GROUP_REMAP: Record<string, (typeof GROUP_ORDER)[number]> = {
  'session.next': 'Navigation',
  'session.prev': 'Navigation',
  'panel.editor': 'Editor'
}

/**
 * Static Orchestra-level shortcuts that don't live in ACTIONS. These are
 * handled either as global app shortcuts or inside the Orchestra module.
 */
const ORCHESTRA_EXTRAS: Row[] = [
  { label: 'Show this cheatsheet', combo: '?' },
  { label: 'Command palette', combo: 'mod+p' },
  { label: 'Open settings', combo: 'mod+,' },
  { label: 'New Orchestra session', combo: 'mod+shift+n' },
  { label: 'Kill focused agent', combo: 'mod+shift+k' },
  { label: 'Toggle sidebar', combo: 'mod+b' }
]

export default function KeyboardCheatsheet({ open, onClose }: Props) {
  const overrides = useKeybinds((s) => s.overrides)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const sections: Section[] = useMemo(() => {
    const bucket = new Map<string, Row[]>()
    for (const title of GROUP_ORDER) bucket.set(title, [])

    for (const { action, combo } of allBindings(overrides)) {
      const group: string = GROUP_REMAP[action.id] ?? action.group
      const target = bucket.get(group) ?? bucket.get('Panels')!
      target.push({ label: action.label, combo })
    }

    bucket.get('Orchestra')!.push(...ORCHESTRA_EXTRAS)

    const needle = query.trim().toLowerCase()
    const filter = (rows: Row[]): Row[] => {
      if (!needle) return rows
      return rows.filter((r) => {
        const pretty = formatCombo(r.combo).toLowerCase()
        return (
          r.label.toLowerCase().includes(needle) ||
          r.combo.toLowerCase().includes(needle) ||
          pretty.includes(needle)
        )
      })
    }

    return GROUP_ORDER.map((title) => ({ title, rows: filter(bucket.get(title) ?? []) })).filter(
      (s) => s.rows.length > 0
    )
  }, [overrides, query])

  if (!open) return null

  const totalVisible = sections.reduce((n, s) => n + s.rows.length, 0)

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-bg-0/85 px-4 backdrop-blur-md df-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden border border-border-mid bg-bg-2 shadow-pop"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        <header className="flex items-center justify-between border-b border-border-soft bg-bg-1 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Keyboard size={14} strokeWidth={1.75} className="text-accent-400" />
            <span className="df-label">keyboard cheatsheet</span>
            <span className="font-mono text-[10px] text-text-4">
              · {totalVisible} shortcut{totalVisible === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
            aria-label="close"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>

        <div className="border-b border-border-soft bg-bg-1 px-4 py-2">
          <div className="flex items-center gap-2 rounded-sm border border-border-soft bg-bg-2 px-2 py-1.5 focus-within:border-accent-500/50">
            <Search size={12} strokeWidth={1.75} className="text-text-4" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter by action or key…"
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-text-1 placeholder:text-text-4 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-sm p-0.5 text-text-4 hover:bg-bg-3 hover:text-text-1"
                aria-label="clear filter"
              >
                <X size={10} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        <div className="df-scroll max-h-[70vh] overflow-y-auto p-4">
          {sections.length === 0 ? (
            <div className="py-10 text-center font-mono text-[11px] text-text-4">
              no shortcuts match <span className="text-text-2">"{query}"</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
              {sections.map((section) => (
                <div key={section.title}>
                  <div className="df-label mb-2 text-accent-400">{section.title}</div>
                  <table className="w-full border-collapse">
                    <tbody>
                      {section.rows.map((row, i) => (
                        <tr
                          key={`${section.title}-${i}-${row.label}`}
                          className="group border-b border-border-soft/40 last:border-b-0 hover:bg-bg-3/50"
                        >
                          <td className="py-1 pr-2 text-[11px] text-text-2">{row.label}</td>
                          <td className="py-1 pl-2 text-right align-middle">
                            {row.combo ? (
                              <ComboChips combo={row.combo} />
                            ) : (
                              <span className="font-mono text-[10px] text-text-4">unbound</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border-soft bg-bg-1 px-4 py-2 font-mono text-[10px] text-text-4">
          <span>{sections.length} sections</span>
          <span>
            press <kbd className="mx-1 rounded-sm bg-bg-3 px-1 text-text-3">?</kbd> any time ·{' '}
            <kbd className="mx-1 rounded-sm bg-bg-3 px-1 text-text-3">Esc</kbd> to close
          </span>
        </footer>
      </div>
    </div>
  )
}

/** Render a combo string as a row of individual <kbd> pills. */
function ComboChips({ combo }: { combo: string }) {
  // formatCombo returns a pretty string with `+` separators on non-mac
  // platforms and bare symbols on mac. Splitting on `+` keeps the chip
  // density readable on both.
  const pretty = formatCombo(combo)
  const tokens = pretty.includes('+') ? pretty.split('+') : [pretty]
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-0.5">
      {tokens.map((t, i) => (
        <kbd
          key={`${t}-${i}`}
          className="rounded-sm border border-border-mid bg-bg-3 px-1 py-0.5 font-mono text-[10px] text-text-2"
        >
          {t}
        </kbd>
      ))}
    </span>
  )
}
