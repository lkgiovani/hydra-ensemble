import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  SearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  setSearchQuery,
} from '@codemirror/search'
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Regex,
  Replace,
  ReplaceAll,
  WholeWord,
  X,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

interface Props {
  view: EditorView
  /** If there's a non-empty selection when opening, prefill it. */
  initialQuery?: string
  onClose: () => void
}

/**
 * Compact, theme-consistent find/replace overlay that lives in the top-
 * right of the editor (VSCode-style). Drives @codemirror/search's query
 * commands directly; we don't load its default panel UI because it
 * ignores our styling and sits awkwardly at the top of the scroll area.
 */
export default function InlineSearch({ view, initialQuery, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regexp, setRegexp] = useState(false)
  const [showReplace, setShowReplace] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select the query input on open / reopen with a new selection.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  // Push the query into CM's search state whenever any control changes.
  // Empty queries are still pushed so stale highlights clear out.
  const cmQuery = useMemo(
    () =>
      new SearchQuery({
        search: query,
        caseSensitive,
        wholeWord,
        regexp,
        replace,
      }),
    [query, caseSensitive, wholeWord, regexp, replace]
  )
  useEffect(() => {
    view.dispatch({ effects: setSearchQuery.of(cmQuery) })
  }, [view, cmQuery])

  const runNext = (): void => {
    findNext(view)
  }
  const runPrev = (): void => {
    findPrevious(view)
  }
  const runReplaceOne = (): void => {
    replaceNext(view)
  }
  const runReplaceAll = (): void => {
    replaceAll(view)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) runPrev()
      else runNext()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="absolute right-3 top-2 z-30 flex select-none items-start gap-0 rounded-md border border-border-mid bg-bg-2/95 shadow-pop backdrop-blur"
      style={{ width: '360px' }}
    >
      {/* Collapse arrow toggles the Replace row. Mirrors VSCode's little caret. */}
      <button
        type="button"
        onClick={() => setShowReplace((v) => !v)}
        className="flex h-full shrink-0 items-center px-1 text-text-3 hover:text-text-1"
        title={showReplace ? 'Hide replace' : 'Show replace'}
        aria-label={showReplace ? 'Hide replace' : 'Show replace'}
      >
        {showReplace ? (
          <ChevronDown size={12} strokeWidth={1.75} />
        ) : (
          <ChevronRight size={12} strokeWidth={1.75} />
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1 py-1.5 pr-1.5">
        {/* Row 1 — find input + flag toggles + nav / close */}
        <div className="flex items-center gap-1">
          <div className="flex flex-1 items-center rounded-sm border border-border-soft bg-bg-1 focus-within:border-accent-500/60">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent px-2 py-0.5 font-mono text-[11.5px] text-text-1 placeholder:text-text-4 focus:outline-none"
            />
            <FlagBtn
              active={caseSensitive}
              onClick={() => setCaseSensitive((v) => !v)}
              title="Match case"
              aria-label="Match case"
            >
              <CaseSensitive size={11} strokeWidth={1.75} />
            </FlagBtn>
            <FlagBtn
              active={wholeWord}
              onClick={() => setWholeWord((v) => !v)}
              title="Match whole word"
              aria-label="Match whole word"
            >
              <WholeWord size={11} strokeWidth={1.75} />
            </FlagBtn>
            <FlagBtn
              active={regexp}
              onClick={() => setRegexp((v) => !v)}
              title="Use regular expression"
              aria-label="Use regular expression"
            >
              <Regex size={11} strokeWidth={1.75} />
            </FlagBtn>
          </div>
          <IconBtn onClick={runPrev} title="Previous match (Shift+Enter)" aria-label="Previous match">
            <ArrowUp size={11} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn onClick={runNext} title="Next match (Enter)" aria-label="Next match">
            <ArrowDown size={11} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn onClick={onClose} title="Close (Esc)" aria-label="Close search">
            <X size={11} strokeWidth={1.75} />
          </IconBtn>
        </div>

        {/* Row 2 — replace input + replace / replace-all */}
        {showReplace ? (
          <div className="flex items-center gap-1">
            <div className="flex flex-1 items-center rounded-sm border border-border-soft bg-bg-1 focus-within:border-accent-500/60">
              <input
                type="text"
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runReplaceOne()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                  }
                }}
                placeholder="Replace"
                className="min-w-0 flex-1 bg-transparent px-2 py-0.5 font-mono text-[11.5px] text-text-1 placeholder:text-text-4 focus:outline-none"
              />
            </div>
            <IconBtn onClick={runReplaceOne} title="Replace" aria-label="Replace">
              <Replace size={11} strokeWidth={1.75} />
            </IconBtn>
            <IconBtn onClick={runReplaceAll} title="Replace all" aria-label="Replace all">
              <ReplaceAll size={11} strokeWidth={1.75} />
            </IconBtn>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ---------- tiny button primitives kept local for styling parity ---------- */

function FlagBtn({
  active,
  onClick,
  title,
  children,
  'aria-label': ariaLabel,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  'aria-label': string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors ${
        active
          ? 'bg-accent-500/25 text-accent-200'
          : 'text-text-3 hover:bg-bg-3 hover:text-text-1'
      }`}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

function IconBtn({
  onClick,
  title,
  children,
  'aria-label': ariaLabel,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  'aria-label': string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-text-3 transition-colors hover:bg-bg-3 hover:text-text-1"
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}
