/**
 * Shared relative-time and duration formatters for the renderer.
 *
 * Consolidates the handful of near-identical "time ago" helpers that had
 * drifted across orchestra panels (TaskRow, TaskKanban, InboxTab, etc.) so
 * every surface reads the same string for the same moment.
 *
 * Zero dependencies — we deliberately avoid date-fns here to keep the
 * renderer bundle lean; these helpers only need the five thresholds we
 * actually render.
 */

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Values below this (in seconds) render as "just now" instead of "Ns". */
const JUST_NOW_THRESHOLD_SEC = 5
/** Days strictly below this render as "Nd"; otherwise we fall back to an
 *  absolute locale date so week-old timestamps read unambiguously. */
const ABSOLUTE_DATE_DAYS = 7

/**
 * Render an ISO timestamp as a compact relative label.
 *
 * Output shape:
 *   - "just now"   when < 5s in the past
 *   - "Ns"          when < 1 min
 *   - "Nm"          when < 1 h
 *   - "Nh"          when < 1 d
 *   - "yesterday"   when exactly 1 day ago
 *   - "Nd"          when < 7 days
 *   - locale date   when >= 7 days
 *
 * Invalid / unparseable input returns an empty string so callers can
 * render a dash-fallback if they want without a conditional inside the
 * helper. Future timestamps are clamped to 0 (render as "just now") —
 * clock skew is common with streamed events and showing "in 3s" is worse
 * than showing "just now".
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Math.max(0, now.getTime() - then)

  const diffSec = Math.floor(diffMs / SECOND_MS)
  if (diffSec < JUST_NOW_THRESHOLD_SEC) return 'just now'
  if (diffSec < 60) return `${diffSec}s`

  const diffMin = Math.floor(diffMs / MINUTE_MS)
  if (diffMin < 60) return `${diffMin}m`

  const diffHr = Math.floor(diffMs / HOUR_MS)
  if (diffHr < 24) return `${diffHr}h`

  const diffDay = Math.floor(diffMs / DAY_MS)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < ABSOLUTE_DATE_DAYS) return `${diffDay}d`

  return new Date(iso).toLocaleDateString()
}

/**
 * Format a millisecond duration as a compact human string.
 *
 * Output shape:
 *   - "Nms"          when < 1 s
 *   - "S.ss"         when < 10 s   (one decimal, e.g. "1.2s")
 *   - "Ss"           when < 1 min  (integer seconds)
 *   - "Mm SSs"       when < 1 h    (e.g. "3m 12s", seconds zero-padded)
 *   - "Hh MMm"       otherwise     (e.g. "1h 04m", minutes zero-padded)
 *
 * Non-finite or non-positive inputs render as "0s" so progress/elapsed
 * widgets never display "NaNs" or "-4s".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'

  if (ms < SECOND_MS) return `${Math.round(ms)}ms`

  const totalSec = ms / SECOND_MS
  if (totalSec < 10) return `${totalSec.toFixed(1)}s`
  if (totalSec < 60) return `${Math.floor(totalSec)}s`

  if (ms < HOUR_MS) {
    const min = Math.floor(ms / MINUTE_MS)
    const sec = Math.floor((ms % MINUTE_MS) / SECOND_MS)
    return `${min}m ${String(sec).padStart(2, '0')}s`
  }

  const hr = Math.floor(ms / HOUR_MS)
  const min = Math.floor((ms % HOUR_MS) / MINUTE_MS)
  return `${hr}h ${String(min).padStart(2, '0')}m`
}
