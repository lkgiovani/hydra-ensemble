import { useEffect, useState } from 'react'
import SessionTabs from './components/SessionTabs'
import SessionPane from './components/SessionPane'
import { useSessions } from './state/sessions'

export default function App() {
  const [claudePath, setClaudePath] = useState<string | null | undefined>(undefined)
  const sessions = useSessions((s) => s.sessions)
  const activeId = useSessions((s) => s.activeId)
  const init = useSessions((s) => s.init)

  useEffect(() => {
    void init()
    void window.api.claude.resolvePath().then(setClaudePath)
  }, [init])

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0d0d0f] text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-[#16161a] px-4 py-2 text-xs text-white/60">
        <div className="font-medium text-white/80">Hydra Ensemble</div>
        <div className="flex gap-3">
          <span>os: {window.api.platform.os}</span>
          <span>
            claude:{' '}
            {claudePath === undefined ? (
              <span className="text-white/40">resolving…</span>
            ) : claudePath === null ? (
              <span className="text-yellow-400">not found in PATH</span>
            ) : (
              <span className="text-emerald-400">{claudePath}</span>
            )}
          </span>
        </div>
      </header>
      <SessionTabs />
      <main className="relative flex-1 overflow-hidden">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-white/40">
            click <span className="mx-1 rounded bg-white/10 px-2 py-0.5">+ new claude session</span> to start
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="absolute inset-0"
              style={{ display: s.id === activeId ? 'block' : 'none' }}
            >
              <SessionPane session={s} visible={s.id === activeId} />
            </div>
          ))
        )}
      </main>
    </div>
  )
}
