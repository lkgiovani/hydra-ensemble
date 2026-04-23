import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionsUiState {
  dashboardOpen: boolean
  openDashboard: () => void
  closeDashboard: () => void
  toggleDashboard: () => void
  chatMinimized: boolean
  toggleChatMinimized: () => void
  setChatMinimized: (v: boolean) => void
}

export const useSessionsUi = create<SessionsUiState>((set) => ({
  dashboardOpen: false,
  openDashboard: () => set({ dashboardOpen: true }),
  closeDashboard: () => set({ dashboardOpen: false }),
  toggleDashboard: () => set((prev) => ({ dashboardOpen: !prev.dashboardOpen })),
  chatMinimized: false,
  toggleChatMinimized: () => set((prev) => ({ chatMinimized: !prev.chatMinimized })),
  setChatMinimized: (v) => set({ chatMinimized: v })
}))

/**
 * Pin state — per-session "stick to the top" flag. Kept in its own store
 * (separate from `useSessions`) because it is a pure UI preference that must
 * survive reloads; the sessions store itself is rebuilt from the main process
 * on every boot. Using `Record<sessionId, true>` (instead of a Set) keeps the
 * slice trivially JSON-serialisable for zustand/persist without a custom
 * `storage` with `createJSONStorage` + reviver.
 */
interface SessionsPinState {
  /** sessionId -> true when pinned. Absence of key means not pinned. */
  pinned: Record<string, true>
  togglePin: (id: string) => void
  isPinned: (id: string) => boolean
  /** Drop pin entries for sessions that no longer exist. */
  prune: (existingIds: readonly string[]) => void
}

export const useSessionsPin = create<SessionsPinState>()(
  persist(
    (set, get) => ({
      pinned: {},

      togglePin: (id) =>
        set((s) => {
          const next = { ...s.pinned }
          if (next[id]) {
            delete next[id]
          } else {
            next[id] = true
          }
          return { pinned: next }
        }),

      isPinned: (id) => !!get().pinned[id],

      prune: (existingIds) =>
        set((s) => {
          const keep = new Set(existingIds)
          const next: Record<string, true> = {}
          let changed = false
          for (const id of Object.keys(s.pinned)) {
            if (keep.has(id)) {
              next[id] = true
            } else {
              changed = true
            }
          }
          return changed ? { pinned: next } : s
        })
    }),
    { name: 'hydra.sessions.pinned' }
  )
)

/** Convenience selector for a single session's pinned flag — stable reference. */
export function selectIsPinned(id: string) {
  return (s: SessionsPinState): boolean => !!s.pinned[id]
}
