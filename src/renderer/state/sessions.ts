import { create } from 'zustand'
import type { SessionCreateOptions, SessionMeta } from '../../shared/types'

interface SessionsState {
  sessions: SessionMeta[]
  activeId: string | null
  isCreating: boolean
  setSessions: (s: SessionMeta[]) => void
  setActive: (id: string | null) => void
  createSession: (opts: Partial<SessionCreateOptions>) => Promise<SessionMeta | null>
  destroySession: (id: string) => Promise<void>
  init: () => Promise<void>
}

export const useSessions = create<SessionsState>((set, get) => ({
  sessions: [],
  activeId: null,
  isCreating: false,

  setSessions: (sessions) => {
    set((prev) => ({
      sessions,
      activeId:
        prev.activeId && sessions.some((s) => s.id === prev.activeId)
          ? prev.activeId
          : (sessions[0]?.id ?? null)
    }))
  },

  setActive: (id) => set({ activeId: id }),

  createSession: async (opts) => {
    if (get().isCreating) return null
    set({ isCreating: true })
    try {
      const res = await window.api.session.create({
        cols: 120,
        rows: 30,
        ...opts
      })
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('[session] create failed:', res.error)
        return null
      }
      // session:changed event will refresh the list — but also do an
      // optimistic set so the new tab shows up immediately.
      set((prev) => ({
        sessions: [...prev.sessions, res.session],
        activeId: res.session.id
      }))
      return res.session
    } finally {
      set({ isCreating: false })
    }
  },

  destroySession: async (id) => {
    await window.api.session.destroy(id)
    set((prev) => {
      const sessions = prev.sessions.filter((s) => s.id !== id)
      const activeId =
        prev.activeId === id ? (sessions[sessions.length - 1]?.id ?? null) : prev.activeId
      return { sessions, activeId }
    })
  },

  init: async () => {
    const sessions = await window.api.session.list()
    set({ sessions, activeId: sessions[0]?.id ?? null })
    window.api.session.onChange((next) => {
      get().setSessions(next)
    })
  }
}))
