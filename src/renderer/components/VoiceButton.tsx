import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Mic } from 'lucide-react'
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
    <div className="absolute bottom-6 right-6 z-30 flex items-end gap-2">
      {error && (
        <div
          className="df-fade-in flex items-center gap-1.5 rounded-md border border-status-attention/30 bg-status-attention/10 px-2.5 py-1.5 text-xs text-status-attention"
          title={error}
        >
          <AlertCircle size={12} strokeWidth={1.75} />
          Mic error
        </div>
      )}
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="rounded-md border border-border-soft bg-bg-3 px-2 py-1 text-[11px] text-text-2 hover:bg-bg-4 focus:outline-none"
        aria-label="Recognition language"
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
        className={`flex h-12 w-12 items-center justify-center rounded-full border border-border-mid bg-bg-3 shadow-card transition hover:bg-bg-4 ${
          recording ? 'border-status-attention/60' : ''
        }`}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
      >
        <Mic
          size={18}
          strokeWidth={1.75}
          className={recording ? 'df-pulse text-status-attention' : 'text-text-2'}
        />
      </button>
    </div>
  )
}
