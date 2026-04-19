import type { SessionState } from '../../shared/types'

/**
 * Analyzes raw PTY byte stream in real-time to detect Claude Code session state.
 * Strips ANSI escape sequences and tracks alternate buffer mode, frame boundaries,
 * and content patterns.
 *
 * Ported 1:1 from Sources/HydraEnsembleCore/PTYStreamAnalyzer.swift.
 * The 50ms debounce uses setTimeout (the JS equivalent of DispatchQueue.main.asyncAfter).
 */
export class PtyStreamAnalyzer {
  public onStateChange?: (state: SessionState) => void

  private _state: SessionState = 'idle'

  // ANSI parser state
  private inEscape = false
  private escapeBuffer: number[] = []

  // Alternate buffer tracking (Claude's TUI uses alternate screen)
  private _alternateBufferActive = false

  // Frame text — reset on screen clear or frame boundary
  private frameText = ''
  private frameTimer: ReturnType<typeof setTimeout> | null = null

  // Rolling recent text (last ~2000 chars of plaintext)
  private recentText = ''
  private readonly recentTextLimit = 2000

  // Debounce delay — 50ms after last data chunk
  private static readonly debounceMs = 50

  public get state(): SessionState {
    return this._state
  }

  public get alternateBufferActive(): boolean {
    return this._alternateBufferActive
  }

  public feed(input: Uint8Array | Buffer | string): void {
    const bytes = this.toBytes(input)

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i]!
      if (this.inEscape) {
        this.processEscapeByte(byte)
      } else if (byte === 0x1b) {
        // ESC
        this.inEscape = true
        this.escapeBuffer = [byte]
      } else {
        // Regular printable character or control char
        if (byte >= 0x20 && byte < 0x7f) {
          const ch = String.fromCharCode(byte)
          this.frameText += ch
          this.recentText += ch
        } else if (byte === 0x0a) {
          // newline
          this.frameText += '\n'
          this.recentText += '\n'
        } else if (byte === 0x0d) {
          // carriage return — ignore (we use LF for newlines)
        }
        // Other control chars (BEL, BS, TAB, etc.) — ignore for analysis
      }
    }

    // Trim recent text buffer
    if (this.recentText.length > this.recentTextLimit) {
      this.recentText = this.recentText.slice(this.recentText.length - this.recentTextLimit)
    }

    // Debounce frame analysis — run 50ms after last data chunk
    if (this.frameTimer !== null) {
      clearTimeout(this.frameTimer)
    }
    this.frameTimer = setTimeout(() => {
      this.frameTimer = null
      this.analyzeFrame()
    }, PtyStreamAnalyzer.debounceMs)
  }

  /** Reset the analyzer (e.g., when restarting a session). */
  public reset(): void {
    this._state = 'idle'
    this._alternateBufferActive = false
    this.inEscape = false
    this.escapeBuffer = []
    this.frameText = ''
    this.recentText = ''
    if (this.frameTimer !== null) {
      clearTimeout(this.frameTimer)
      this.frameTimer = null
    }
  }

  // MARK: - ANSI Escape Sequence Parser

  private processEscapeByte(byte: number): void {
    this.escapeBuffer.push(byte)

    // ESC [ ... <final byte> — CSI sequence
    if (this.escapeBuffer.length === 2 && byte === 0x5b) {
      // [
      return // start of CSI, keep reading
    }

    // ESC ] ... BEL/ST — OSC sequence
    if (this.escapeBuffer.length === 2 && byte === 0x5d) {
      // ]
      return // start of OSC, keep reading
    }

    // Inside CSI sequence — wait for final byte (0x40-0x7E)
    if (this.escapeBuffer.length >= 3 && this.escapeBuffer[1] === 0x5b) {
      if (byte >= 0x40 && byte <= 0x7e) {
        // CSI sequence complete — check for important ones
        this.checkCSISequence()
        this.endEscape()
      }
      return
    }

    // Inside OSC sequence — wait for BEL (0x07) or ST (ESC \)
    if (this.escapeBuffer.length >= 3 && this.escapeBuffer[1] === 0x5d) {
      if (byte === 0x07) {
        // BEL terminates OSC
        this.endEscape()
      } else if (
        byte === 0x5c &&
        this.escapeBuffer.length >= 2 &&
        this.escapeBuffer[this.escapeBuffer.length - 2] === 0x1b
      ) {
        // ESC \ terminates OSC
        this.endEscape()
      }
      // Keep reading OSC content (don't let it grow unbounded)
      if (this.escapeBuffer.length > 256) {
        this.endEscape() // bail on absurdly long sequences
      }
      return
    }

    // Simple two-byte escape (ESC + single char) — e.g., ESC M, ESC 7, ESC 8
    if (this.escapeBuffer.length === 2) {
      this.endEscape()
      return
    }

    // Safety: if escape buffer gets too long, bail
    if (this.escapeBuffer.length > 64) {
      this.endEscape()
    }
  }

  private checkCSISequence(): void {
    // Extract parameter string (bytes between '[' and final byte)
    if (this.escapeBuffer.length < 3) return
    const paramBytes = this.escapeBuffer.slice(2, this.escapeBuffer.length - 1)
    const finalByte = this.escapeBuffer[this.escapeBuffer.length - 1]!
    let paramStr = ''
    for (const b of paramBytes) {
      // Mirror Swift's Unicode.Scalar(UInt32) — accept anything in valid range.
      if (b <= 0x10ffff) {
        paramStr += String.fromCharCode(b)
      }
    }

    // Detect alternate buffer switch
    // CSI ? 1049 h = enter alternate buffer
    // CSI ? 1049 l = leave alternate buffer
    if (paramStr === '?1049') {
      if (finalByte === 0x68) {
        // 'h'
        this._alternateBufferActive = true
        this.frameText = '' // fresh frame
      } else if (finalByte === 0x6c) {
        // 'l'
        this._alternateBufferActive = false
        this.frameText = ''
        // Claude exited — immediate state change
        this.updateState('idle')
      }
    }

    // Detect screen clear: CSI 2 J
    if (paramStr === '2' && finalByte === 0x4a) {
      // 'J'
      this.frameText = '' // new frame
    }

    // Detect cursor home: CSI H (no params)
    if (paramStr.length === 0 && finalByte === 0x48) {
      // 'H'
      // Often precedes a full redraw, but don't clear yet
    }
  }

  private endEscape(): void {
    this.inEscape = false
    this.escapeBuffer = []
  }

  // MARK: - Frame Analysis

  private analyzeFrame(): void {
    // Look at the most recent content (last ~500 chars) for bottom-of-screen indicators
    const recentLower = this.recentText.slice(Math.max(0, this.recentText.length - 500)).toLowerCase()

    let newState: SessionState

    // Permission prompts — highest priority
    if (recentLower.includes('allow') && recentLower.includes('deny')) {
      newState = 'needsAttention'
    } else if (recentLower.includes('[y/n]') || recentLower.includes('(y/n)')) {
      newState = 'needsAttention'
    } else if (recentLower.includes('do you want to proceed')) {
      newState = 'needsAttention'
    }
    // "esc to interrupt" = Claude is actively working RIGHT NOW
    else if (recentLower.includes('esc to interrupt') || recentLower.includes('esc to cancel')) {
      if (recentLower.includes('thinking')) {
        newState = 'thinking'
      } else {
        newState = 'generating'
      }
    }
    // Claude's prompt marker — waiting for user
    // Use the very recent text (last ~100 chars) to detect the active prompt
    else if (
      this.recentText.slice(Math.max(0, this.recentText.length - 100)).includes('/effort') ||
      this.recentText.slice(Math.max(0, this.recentText.length - 50)).includes('> ')
    ) {
      // Claude is showing its UI but not working — at the input prompt
      // "/effort" appears in Claude's bottom bar, ">" is the prompt
      newState = 'userInput'
    }
    // Shell prompt — Claude not running
    else if (
      recentLower.endsWith('$ ') ||
      recentLower.endsWith('% ') ||
      recentLower.includes('❯')
    ) {
      newState = 'idle'
    } else {
      // Can't determine — keep current state
      return
    }

    this.updateState(newState)
  }

  private updateState(newState: SessionState): void {
    if (newState === this._state) return
    this._state = newState
    this.onStateChange?.(newState)
  }

  private toBytes(input: Uint8Array | Buffer | string): Uint8Array {
    if (typeof input === 'string') {
      return new TextEncoder().encode(input)
    }
    if (input instanceof Uint8Array) {
      return input
    }
    // Buffer extends Uint8Array, but be defensive.
    return new Uint8Array(input)
  }
}
