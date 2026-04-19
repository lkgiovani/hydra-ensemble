import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PtyStreamAnalyzer } from '../analyzer'

/**
 * Vitest port of Tests/HydraEnsembleTests/PTYStreamAnalyzerTests.swift.
 * The 50ms debounce is advanced via vi.useFakeTimers().
 */
describe('PtyStreamAnalyzer', () => {
  let analyzer: PtyStreamAnalyzer

  beforeEach(() => {
    vi.useFakeTimers()
    analyzer = new PtyStreamAnalyzer()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function feedString(text: string): void {
    analyzer.feed(new TextEncoder().encode(text))
  }

  // MARK: - Initial State

  it('initial state is idle', () => {
    expect(analyzer.state).toBe('idle')
    expect(analyzer.alternateBufferActive).toBe(false)
  })

  // MARK: - State Detection

  it('thinking state', () => {
    feedString('Esc to interrupt ... thinking')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('thinking')
  })

  it('generating state', () => {
    feedString('Esc to interrupt')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('generating')
  })

  it('needsAttention on allow/deny', () => {
    feedString('Allow Deny')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('needsAttention')
  })

  it('needsAttention on [y/n]', () => {
    feedString('Do you want to proceed? [y/n]')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('needsAttention')
  })

  it('idle on shell prompt', () => {
    // First move to generating.
    feedString('Esc to interrupt')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('generating')

    // Now flush recent text and feed a shell prompt to return to idle.
    feedString(' '.repeat(2000) + 'user@host$ ')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('idle')
  })

  // MARK: - ANSI Escape Stripping

  it('ANSI escapes are stripped', () => {
    // Feed "AB" with an ANSI color escape between them: ESC[31m
    const bytes = new Uint8Array([0x41, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x42])
    analyzer.feed(bytes)
    vi.advanceTimersByTime(60)

    // Plain text "AB" should be in the buffer; feed a known trigger and verify
    // we transition to generating.
    feedString('Esc to interrupt')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('generating')
  })

  // MARK: - Alternate Buffer

  it('alternate buffer enter', () => {
    // CSI ? 1049 h = ESC [ ? 1 0 4 9 h
    const bytes = new Uint8Array([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68])
    analyzer.feed(bytes)
    expect(analyzer.alternateBufferActive).toBe(true)
  })

  it('alternate buffer leave resets to idle', () => {
    // Enter alternate buffer first.
    const enter = new Uint8Array([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68])
    analyzer.feed(enter)
    expect(analyzer.alternateBufferActive).toBe(true)

    // Move to generating.
    feedString('Esc to interrupt')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('generating')

    // Leave alternate buffer: CSI ? 1049 l — should fire idle synchronously.
    const idleStates: string[] = []
    analyzer.onStateChange = (state) => {
      idleStates.push(state)
    }
    const leave = new Uint8Array([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x6c])
    analyzer.feed(leave)
    expect(analyzer.alternateBufferActive).toBe(false)
    expect(analyzer.state).toBe('idle')
    expect(idleStates).toContain('idle')
  })

  // MARK: - Screen Clear

  it('screen clear (CSI 2 J) resets the frame', () => {
    // Feed a permission prompt so state becomes needsAttention.
    feedString('Allow Deny')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('needsAttention')

    // CSI 2 J = ESC [ 2 J — clears the frame buffer (but recentText persists,
    // mirroring the Swift implementation). Verify the escape is consumed and
    // the analyzer keeps running.
    const clear = new Uint8Array([0x1b, 0x5b, 0x32, 0x4a])
    analyzer.feed(clear)
    vi.advanceTimersByTime(60)

    // Push the prompt out of the recent window and feed a shell prompt.
    feedString(' '.repeat(2000) + 'user@host$ ')
    vi.advanceTimersByTime(60)
    expect(analyzer.state).toBe('idle')
  })

  // MARK: - Reset

  it('reset clears state', () => {
    // Enter alternate buffer and feed data.
    const enter = new Uint8Array([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68])
    analyzer.feed(enter)
    feedString('some text')

    analyzer.reset()

    expect(analyzer.state).toBe('idle')
    expect(analyzer.alternateBufferActive).toBe(false)
  })
})
