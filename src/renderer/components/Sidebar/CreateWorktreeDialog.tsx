import { useEffect, useRef, useState } from 'react'
import { GitBranch } from 'lucide-react'

interface CreateWorktreeDialogProps {
  onSubmit: (name: string, baseBranch?: string) => void | Promise<void>
  onCancel: () => void
}

export default function CreateWorktreeDialog({ onSubmit, onCancel }: CreateWorktreeDialogProps) {
  const [name, setName] = useState('')
  const [base, setBase] = useState('')
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trimmedName = name.trim()
  const showError = touched && trimmedName.length === 0

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setTouched(true)
    if (!trimmedName || busy) return
    setBusy(true)
    try {
      await onSubmit(trimmedName, base.trim() || undefined)
    } finally {
      setBusy(false)
    }
  }

  const inputBase =
    'w-full rounded-sm border bg-bg-1 px-2 py-1.5 font-mono text-xs text-text-1 placeholder:text-text-4 focus:outline-none disabled:opacity-50'

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className="mx-2 mb-1 mt-1 rounded-md border border-border-mid bg-bg-3 p-2.5 shadow-soft df-fade-in"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-4">
        <GitBranch size={12} strokeWidth={1.75} />
        <span>new worktree</span>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          if (!touched) setTouched(true)
        }}
        onBlur={() => setTouched(true)}
        placeholder="branch name"
        aria-invalid={showError}
        className={`${inputBase} mb-1.5 ${
          showError ? 'border-status-attention/60' : 'border-border-soft'
        }`}
        disabled={busy}
      />
      <input
        type="text"
        value={base}
        onChange={(e) => setBase(e.target.value)}
        placeholder="base branch (optional)"
        className={`${inputBase} mb-2 border-border-soft`}
        disabled={busy}
      />

      {showError && (
        <div className="mb-2 text-[11px] text-status-attention">
          name is required
        </div>
      )}

      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-sm px-2.5 py-1 text-xs text-text-3 transition-colors hover:bg-bg-4 hover:text-text-1 disabled:opacity-50"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={busy || !trimmedName}
          className="df-lift rounded-sm bg-accent-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-600 disabled:opacity-40 disabled:hover:bg-accent-500"
        >
          {busy ? 'creating…' : 'create'}
        </button>
      </div>
    </form>
  )
}
