import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'warning' | 'error' | 'attention'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  /** Optional actions rendered as inline accent links on the right side. */
  actions?: ToastAction[]
  /** Optional session id to focus when the user clicks the toast. */
  sessionId?: string
  /** Milliseconds before auto-dismiss. Defaults depend on kind (see DEFAULT_DURATION_MS). */
  durationMs?: number
  /** When true, disables auto-dismiss. */
  pinned?: boolean
  createdAt: number
}

/** Input accepted by `push`. `id` is optional (generated when absent).
 *  If the caller provides an `id` that matches an existing toast the call is
 *  treated as an `update` — long-running ops can morph a single toast. */
export type ToastInput = Omit<Toast, 'createdAt' | 'id'> & { id?: string }

/** Default auto-dismiss duration per kind (in ms). */
export const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  info: 5_000,
  success: 5_000,
  attention: 8_000,
  warning: 8_000,
  error: 12_000
}

/** Maximum concurrent toasts. Older ones are dropped FIFO. */
export const MAX_TOASTS = 5

interface State {
  toasts: Toast[]
  push: (t: ToastInput) => string
  update: (id: string, patch: Partial<Omit<Toast, 'id' | 'createdAt'>>) => void
  dismiss: (id: string) => void
  clear: () => void
}

let _seq = 0
const nextId = (): string => `t-${Date.now().toString(36)}-${++_seq}`

const resolveDuration = (t: Pick<Toast, 'kind' | 'durationMs' | 'pinned'>): number => {
  if (t.pinned) return 0
  if (typeof t.durationMs === 'number') return t.durationMs
  return DEFAULT_DURATION_MS[t.kind] ?? 5_000
}

export const useToasts = create<State>((set, get) => ({
  toasts: [],
  push: (input) => {
    const existing = input.id ? get().toasts.find((x) => x.id === input.id) : undefined
    if (existing) {
      get().update(existing.id, input)
      return existing.id
    }

    const id = input.id ?? nextId()
    const toast: Toast = {
      id,
      createdAt: Date.now(),
      ...input
    }

    set((s) => {
      const next = [...s.toasts, toast]
      // Enforce stack cap — drop oldest first.
      return { toasts: next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next }
    })

    const ttl = resolveDuration(toast)
    if (ttl > 0) {
      setTimeout(() => {
        const current = get().toasts.find((x) => x.id === id)
        // Only dismiss if the toast hasn't been patched to pinned since scheduling.
        if (current && !current.pinned) get().dismiss(id)
      }, ttl)
    }
    return id
  },
  update: (id, patch) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t))
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] })
}))
