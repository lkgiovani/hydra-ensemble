import { useEffect, useRef } from 'react'
import { useSessions } from '../state/sessions'
import { useToasts } from '../state/toasts'
import type { SessionMeta, SessionState } from '../../shared/types'

/**
 * SessionReplyToaster
 *
 * Pure side-effect observer. Subscribes to `useSessions` and fires an `info`
 * toast every time a *non-active* classic session transitions from a working
 * state (`thinking` | `generating`) to a settled/ready state (`userInput` |
 * `idle`) AND produced a new assistant reply.
 *
 * Why this lives as a component instead of a store subscription:
 *  - Keeps the toast preference gate (`hydra.sessions.replyToastEnabled`)
 *    cleanly scoped to the renderer — the main `sessions` store already owns
 *    a different set of attention / ready toasts and we don't want to tangle
 *    this UX preference into that critical-path code.
 *  - Lets settings panels mount/unmount the observer by conditionally
 *    rendering it (or just flipping the persisted flag).
 *
 * Renders nothing. Always returns null.
 */

const STORAGE_KEY = 'hydra.sessions.replyToastEnabled'
const COALESCE_WINDOW_MS = 2_000

/** Read the persisted preference. Defaults to `true` when unset/corrupted. */
export function getReplyToastEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return true
    return raw !== 'false'
  } catch {
    // Private-mode / disabled storage — default to on so users still get toasts.
    return true
  }
}

/** Persist the preference. Safe no-op when storage is unavailable. */
export function setReplyToastEnabled(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
  } catch {
    // ignore — preference is best-effort persistent.
  }
}

type WorkingState = Extract<SessionState, 'thinking' | 'generating'>
type ReadyState = Extract<SessionState, 'userInput' | 'idle'>

const WORKING = new Set<SessionState>(['thinking', 'generating'])
const READY = new Set<SessionState>(['userInput', 'idle'])

interface PrevSnapshot {
  state: SessionState | undefined
  latestAssistantText: string | undefined
}

interface Props {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SessionReplyToaster(_: Props) {
  // Preference is read ONCE on mount — matches spec. If the user toggles the
  // setting the component is expected to be remounted (or the app reloaded)
  // for the new value to take effect. Keeping this immutable avoids a whole
  // class of "subscription stopped firing because the gate flipped mid-flight"
  // bugs when the user is toggling rapidly.
  const enabledRef = useRef<boolean>(getReplyToastEnabled())

  // Per-session previous snapshot. Using a ref (not state) because we only
  // read/write it inside the subscription callback — never during render.
  const prevRef = useRef<Map<string, PrevSnapshot>>(new Map())

  // Per-session last-toast timestamp, used to coalesce bursts of rapid
  // state flips (working -> ready -> working -> ready within ~2s) into a
  // single toast. Separate from prevRef so the snapshot can still advance
  // on every tick for correctness of the transition check.
  const lastToastAtRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!enabledRef.current) return

    // Seed the previous-state map with the current snapshot so we don't
    // fire a toast for whatever transition happened to land right before
    // mount (cold start would otherwise spam every ready session).
    const seed = useSessions.getState().sessions
    for (const s of seed) {
      prevRef.current.set(s.id, {
        state: s.state,
        latestAssistantText: s.latestAssistantText
      })
    }

    const unsubscribe = useSessions.subscribe((curr, prev) => {
      if (curr.sessions === prev.sessions && curr.activeId === prev.activeId) {
        // Neither the session list nor the active tab changed — nothing to do.
        // Zustand fires for ANY slice change; we only care about these two.
        return
      }

      const activeId = curr.activeId
      const now = Date.now()

      // Track which ids we saw this tick so we can prune departed sessions
      // from the snapshot maps (avoids unbounded growth across long sessions).
      const seenIds = new Set<string>()

      for (const session of curr.sessions) {
        seenIds.add(session.id)
        const snapshot = prevRef.current.get(session.id)
        const nextSnap: PrevSnapshot = {
          state: session.state,
          latestAssistantText: session.latestAssistantText
        }

        // No previous snapshot = first time we're seeing this session.
        // Record it and move on; we need at least one prior tick to detect
        // a transition.
        if (!snapshot) {
          prevRef.current.set(session.id, nextSnap)
          continue
        }

        const wasWorking =
          snapshot.state !== undefined && WORKING.has(snapshot.state as WorkingState)
        const nowReady =
          session.state !== undefined && READY.has(session.state as ReadyState)
        const transitioned = wasWorking && nowReady
        const isActive = session.id === activeId
        const hasReply =
          typeof session.latestAssistantText === 'string' &&
          session.latestAssistantText.length > 0
        // Only fire when the reply text actually changed — otherwise a flip
        // triggered by something unrelated (e.g. user re-entering and the
        // analyzer bouncing back to idle) would re-toast stale content.
        const replyChanged = snapshot.latestAssistantText !== session.latestAssistantText

        if (transitioned && !isActive && hasReply && replyChanged) {
          const last = lastToastAtRef.current.get(session.id) ?? 0
          if (now - last >= COALESCE_WINDOW_MS) {
            lastToastAtRef.current.set(session.id, now)
            pushReplyToast(session)
          }
          // When inside the coalesce window we intentionally drop the toast
          // but still advance the snapshot below so the *next* transition
          // after the window is detected correctly.
        }

        prevRef.current.set(session.id, nextSnap)
      }

      // Clean up refs for sessions that no longer exist.
      for (const id of prevRef.current.keys()) {
        if (!seenIds.has(id)) {
          prevRef.current.delete(id)
          lastToastAtRef.current.delete(id)
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return null
}

function pushReplyToast(session: SessionMeta): void {
  const body = (session.latestAssistantText ?? '').slice(0, 120)
  useToasts.getState().push({
    kind: 'info',
    title: `${session.name} replied`,
    body,
    sessionId: session.id,
    actions: [
      {
        label: 'Open',
        onClick: () => useSessions.getState().setActive(session.id)
      }
    ]
  })
}
