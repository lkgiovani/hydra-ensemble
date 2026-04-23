/**
 * Notifications slice — "seen-up-to" cursor for the Orchestra header bell.
 *
 * We don't mirror a list of notification entries here. The bell derives its
 * unread count purely from the live slices on `useOrchestra` (tasks,
 * messageLog) by comparing their `at`/`finishedAt` timestamps against
 * `lastSeenAt`. Anything strictly newer than that ISO timestamp is unread.
 *
 * Persistence is intentional: a user who dismisses the bell on one launch
 * shouldn't have yesterday's failures greet them again tomorrow. The
 * default of `new Date(0).toISOString()` ensures a brand-new install
 * surfaces every historical event so the very first click acts as a
 * "mark everything as read" gesture, which matches how most users mentally
 * model a notifications inbox on first launch.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface NotificationsState {
  /** ISO timestamp — we consider any event newer than this as unread. */
  lastSeenAt: string
  markAllSeen(): void
}

/** Epoch as ISO — forces every historical event to count as unread on
 *  the very first render, until the user clicks the bell for the first
 *  time. Using `new Date(0)` keeps the value deterministic across
 *  timezones (UTC midnight 1970-01-01). */
const EPOCH_ISO = new Date(0).toISOString()

export const useNotifications = create<NotificationsState>()(
  persist(
    (set) => ({
      lastSeenAt: EPOCH_ISO,
      markAllSeen: () => {
        // Stamp with the current wall clock. Any event whose `at` is
        // strictly greater than this string will reappear as unread —
        // including events that may arrive in the same millisecond, which
        // is desirable: we'd rather show a ghost unread than silently
        // swallow a failure the user hasn't actually seen yet.
        set({ lastSeenAt: new Date().toISOString() })
      }
    }),
    {
      name: 'hydra.orchestra.notifications',
      storage: createJSONStorage(() => localStorage),
      // Only the cursor needs to survive reloads — no derived state.
      partialize: (s) => ({ lastSeenAt: s.lastSeenAt })
    }
  )
)
