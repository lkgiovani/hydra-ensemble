/**
 * Thin wrapper around the Web Speech API (`SpeechRecognition` /
 * `webkitSpeechRecognition`). Streams interim results via `onResult`
 * and surfaces fatal errors via `onError`. Only one recording session
 * may be active at a time per instance.
 */

// The DOM lib doesn't ship a stable type for SpeechRecognition; declare
// the slice we use to keep this strict-TS friendly.
interface RecognitionAlternative {
  transcript: string
  confidence: number
}
interface RecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}
interface RecognitionResultList {
  length: number
  [index: number]: RecognitionResult
}
interface RecognitionEvent extends Event {
  resultIndex: number
  results: RecognitionResultList
}
interface RecognitionErrorEvent extends Event {
  error: string
  message?: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((evt: RecognitionEvent) => void) | null
  onerror: ((evt: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export class VoiceRecorder {
  onResult: ((text: string) => void) | null = null
  onError: ((err: string) => void) | null = null

  private recognizer: SpeechRecognitionLike | null = null
  private active = false

  static isSupported(): boolean {
    return getCtor() !== null
  }

  isRecording(): boolean {
    return this.active
  }

  start(lang: string): void {
    if (this.active) return
    const Ctor = getCtor()
    if (!Ctor) {
      this.onError?.('SpeechRecognition not supported in this browser')
      return
    }
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    rec.onresult = (evt) => {
      let finalText = ''
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const result = evt.results[i]
        if (result && result.isFinal) {
          const alt = result[0]
          if (alt) finalText += alt.transcript
        }
      }
      if (finalText.trim().length > 0) {
        this.onResult?.(finalText.trim())
      }
    }
    rec.onerror = (evt) => {
      this.onError?.(evt.error || 'recognition error')
      this.active = false
    }
    rec.onend = () => {
      this.active = false
    }
    try {
      rec.start()
      this.recognizer = rec
      this.active = true
    } catch (err) {
      this.onError?.((err as Error).message)
    }
  }

  stop(): void {
    if (!this.active || !this.recognizer) return
    try {
      this.recognizer.stop()
    } catch {
      // already stopped
    }
    this.active = false
  }
}
