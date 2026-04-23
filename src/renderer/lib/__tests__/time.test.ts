import { describe, expect, it } from 'vitest'
import { formatDuration, relativeTime } from '../time'

/** Fixed "now" used across all relativeTime tests so they stay deterministic
 *  regardless of when the suite runs. Picked mid-day so we don't skate
 *  across a day boundary on the toLocaleDateString fallback. */
const NOW = new Date('2026-04-22T12:00:00.000Z')

/** Helper to subtract a duration from NOW and return the ISO. Keeps test
 *  bodies readable — `iso({ seconds: 30 })` beats inline Date arithmetic. */
function iso(offset: {
  seconds?: number
  minutes?: number
  hours?: number
  days?: number
}): string {
  const ms =
    (offset.seconds ?? 0) * 1000 +
    (offset.minutes ?? 0) * 60 * 1000 +
    (offset.hours ?? 0) * 60 * 60 * 1000 +
    (offset.days ?? 0) * 24 * 60 * 60 * 1000
  return new Date(NOW.getTime() - ms).toISOString()
}

describe('relativeTime', () => {
  it('returns "just now" for timestamps within the last 5 seconds', () => {
    expect(relativeTime(iso({ seconds: 0 }), NOW)).toBe('just now')
    expect(relativeTime(iso({ seconds: 4 }), NOW)).toBe('just now')
  })

  it('returns "Ns" for sub-minute diffs starting at the 5s boundary', () => {
    expect(relativeTime(iso({ seconds: 5 }), NOW)).toBe('5s')
    expect(relativeTime(iso({ seconds: 30 }), NOW)).toBe('30s')
    expect(relativeTime(iso({ seconds: 59 }), NOW)).toBe('59s')
  })

  it('returns "Nm" for sub-hour diffs', () => {
    expect(relativeTime(iso({ minutes: 1 }), NOW)).toBe('1m')
    expect(relativeTime(iso({ minutes: 2 }), NOW)).toBe('2m')
    expect(relativeTime(iso({ minutes: 59 }), NOW)).toBe('59m')
  })

  it('returns "Nh" for sub-day diffs', () => {
    expect(relativeTime(iso({ hours: 1 }), NOW)).toBe('1h')
    expect(relativeTime(iso({ hours: 5 }), NOW)).toBe('5h')
    expect(relativeTime(iso({ hours: 23 }), NOW)).toBe('23h')
  })

  it('returns "yesterday" for exactly one day ago', () => {
    expect(relativeTime(iso({ days: 1 }), NOW)).toBe('yesterday')
    // 1 day + a few hours still floors to one day.
    expect(relativeTime(iso({ days: 1, hours: 5 }), NOW)).toBe('yesterday')
  })

  it('returns "Nd" for 2-6 day diffs', () => {
    expect(relativeTime(iso({ days: 2 }), NOW)).toBe('2d')
    expect(relativeTime(iso({ days: 3 }), NOW)).toBe('3d')
    expect(relativeTime(iso({ days: 6 }), NOW)).toBe('6d')
  })

  it('returns an absolute locale date for diffs >= 7 days', () => {
    const sevenDaysAgoIso = iso({ days: 7 })
    const expected = new Date(sevenDaysAgoIso).toLocaleDateString()
    expect(relativeTime(sevenDaysAgoIso, NOW)).toBe(expected)

    const thirtyDaysAgoIso = iso({ days: 30 })
    expect(relativeTime(thirtyDaysAgoIso, NOW)).toBe(
      new Date(thirtyDaysAgoIso).toLocaleDateString(),
    )
  })

  it('clamps future timestamps to "just now" rather than showing negatives', () => {
    const futureIso = new Date(NOW.getTime() + 60_000).toISOString()
    expect(relativeTime(futureIso, NOW)).toBe('just now')
  })

  it('returns an empty string for invalid ISO input', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('')
    expect(relativeTime('', NOW)).toBe('')
  })

  it('defaults "now" to the current time when omitted', () => {
    const recent = new Date(Date.now() - 500).toISOString()
    expect(relativeTime(recent)).toBe('just now')
  })
})

describe('formatDuration', () => {
  it('returns "0s" for zero, negative, NaN, and Infinity', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(-500)).toBe('0s')
    expect(formatDuration(Number.NaN)).toBe('0s')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0s')
  })

  it('renders sub-second durations in milliseconds', () => {
    expect(formatDuration(250)).toBe('250ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('renders sub-10-second durations with one decimal', () => {
    expect(formatDuration(1200)).toBe('1.2s')
    expect(formatDuration(9499)).toBe('9.5s')
  })

  it('renders 10s-59s as integer seconds', () => {
    expect(formatDuration(10_000)).toBe('10s')
    expect(formatDuration(45_500)).toBe('45s')
    expect(formatDuration(59_999)).toBe('59s')
  })

  it('renders sub-hour durations as "Mm SSs" with zero-padded seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 00s')
    expect(formatDuration(3 * 60_000 + 12_000)).toBe('3m 12s')
    expect(formatDuration(59 * 60_000 + 5_000)).toBe('59m 05s')
  })

  it('renders hour-plus durations as "Hh MMm" with zero-padded minutes', () => {
    expect(formatDuration(60 * 60_000)).toBe('1h 00m')
    expect(formatDuration(60 * 60_000 + 4 * 60_000)).toBe('1h 04m')
    expect(formatDuration(2 * 60 * 60_000 + 30 * 60_000)).toBe('2h 30m')
  })

  it('does not leak seconds into the hour branch', () => {
    // 1h 04m 37s should still render as "1h 04m" — no trailing seconds.
    const ms = 60 * 60_000 + 4 * 60_000 + 37_000
    expect(formatDuration(ms)).toBe('1h 04m')
  })
})
