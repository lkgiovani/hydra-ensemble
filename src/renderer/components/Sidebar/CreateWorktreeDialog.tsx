import { useEffect, useRef, useState } from 'react'

interface CreateWorktreeDialogProps {
  onSubmit: (name: string, baseBranch?: string) => void | Promise<void>
  onCancel: () => void
}

export default function CreateWorktreeDialog({ onSubmit, onCancel }: CreateWorktreeDialogProps) {
  const [name, setName] = useState('')
  const [base, setBase] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onSubmit(trimmed, base.trim() || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className="mx-2 mt-1 mb-1 rounded border border-white/10 bg-[#16161a] p-2"
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="worktree name"
        className="mb-1 w-full rounded bg-[#0d0d0f] px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        disabled={busy}
      />
      <input
        type="text"
        value={base}
        onChange={(e) => setBase(e.target.value)}
        placeholder="base branch (optional)"
        className="mb-2 w-full rounded bg-[#0d0d0f] px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        disabled={busy}
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded px-2 py-1 text-xs text-white/60 hover:bg-white/5 hover:text-white/90 disabled:opacity-50"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
        >
          {busy ? 'creating…' : 'create'}
        </button>
      </div>
    </form>
  )
}
