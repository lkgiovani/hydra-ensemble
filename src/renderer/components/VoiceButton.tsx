import { useEffect, useRef, useState } from 'react'
import { VoiceRecorder } from '../voice/recorder'
import { useSessions } from '../state/sessions'

const LANGS = [
  { code: 'pt-BR', label: 'PT-BR' },
  { code: 'en-US', label: 'EN-US' }
] as const

/**
 * Floating microphone button anchored to the bottom-right of the active
 * session pane. Pulses red while recording. On a final result, types the
 * dictated text into the active session's PTY.
 *
 * Hidden entirely when `VoiceRecorder.isSupported()` returns false (e.g.
 * Linux Electron without the speech API enabled).
 */
export default function VoiceButton() {
  const sessions = useSessions((s) => s.sessions)
  const activeId = useSessions((s) => s.activeId)
  const [recording, setRecording] = useState(false)
  const [lang, setLang] = useState<string>(LANGS[0].code)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const supported = VoiceRecorder.isSupported()

  useEffect(() => {
    if (!supported) return
    const rec = new VoiceRecorder()
    rec.onResult = (text) => {
      const session = sessions.find((s) => s.id === activeId)
      if (!session) return
      void window.api.pty.write(session.ptyId, text)
    }
    rec.onError = (err) => {
      setError(err)
      setRecording(false)
    }
    recorderRef.current = rec
    return () => {
      rec.stop()
      recorderRef.current = null
    }
  }, [supported, sessions, activeId])

  const toggle = (): void => {
    const rec = recorderRef.current
    if (!rec) return
    if (recording) {
      rec.stop()
      setRecording(false)
    } else {
      setError(null)
      rec.start(lang)
      setRecording(true)
    }
  }

  useEffect(() => {
    if (!supported) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // toggle reads from refs/state; deps cover the user-visible bits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, recording, lang])

  if (!supported) return null

  return (
    <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
      {error && (
        <span
          className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] text-red-200"
          title={error}
        >
          mic err
        </span>
      )}
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/70 outline-none"
        aria-label="recognition language"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={toggle}
        title="Cmd/Ctrl+Shift+V"
        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg transition-colors ${
          recording
            ? 'animate-pulse bg-red-500 hover:bg-red-600'
            : 'bg-sky-500/80 hover:bg-sky-500'
        }`}
        aria-label={recording ? 'stop recording' : 'start recording'}
      >
        {recording ? 'OFF' : 'MIC'}
      </button>
    </div>
  )
}
