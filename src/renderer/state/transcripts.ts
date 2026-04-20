import { create } from 'zustand'
import type { TranscriptMessage } from '../../shared/types'

interface Entry {
  messages: TranscriptMessage[]
  path: string | null
  loading: boolean
  loadedAt: number
}

interface TranscriptState {
  byId: Record<string, Entry>
  /** Fetch + cache the full transcript for a session. Safe to call often. */
  refresh: (sessionId: string) => Promise<void>
  /** Start listening for transcriptChanged events. Wired once from the app root. */
  init: () => void
}

/** Debounced refetch per session — coalesces bursts of JSONL writes. */
const pendingRefetch = new Map<string, ReturnType<typeof setTimeout>>()

export const useTranscripts = create<TranscriptState>((set, get) => ({
  byId: {},

  refresh: async (sessionId) => {
    const prev = get().byId[sessionId]
    set({
      byId: {
        ...get().byId,
        [sessionId]: {
          messages: prev?.messages ?? [],
          path: prev?.path ?? null,
          loading: true,
          loadedAt: prev?.loadedAt ?? 0
        }
      }
    })
    try {
      const payload = await window.api.session.readTranscript(sessionId)
      set({
        byId: {
          ...get().byId,
          [sessionId]: {
            messages: payload.messages,
            path: payload.path,
            loading: false,
            loadedAt: Date.now()
          }
        }
      })
    } catch {
      // Keep previous entry on error; just clear the loading flag.
      const cur = get().byId[sessionId]
      if (cur) {
        set({
          byId: {
            ...get().byId,
            [sessionId]: { ...cur, loading: false }
          }
        })
      }
    }
  },

  init: () => {
    window.api.session.onTranscriptChanged((evt) => {
      // Debounce: claude often flushes several lines in quick succession —
      // one read after the dust settles avoids re-parsing the whole file
      // on every single append.
      const existing = pendingRefetch.get(evt.sessionId)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        pendingRefetch.delete(evt.sessionId)
        void get().refresh(evt.sessionId)
      }, 200)
      pendingRefetch.set(evt.sessionId, timer)
    })
  }
}))
