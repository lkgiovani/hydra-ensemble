import { useSessions } from '../state/sessions'

export default function SessionTabs() {
  const sessions = useSessions((s) => s.sessions)
  const activeId = useSessions((s) => s.activeId)
  const setActive = useSessions((s) => s.setActive)
  const destroy = useSessions((s) => s.destroySession)
  const create = useSessions((s) => s.createSession)
  const isCreating = useSessions((s) => s.isCreating)

  if (sessions.length === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#16161a] px-3 py-1">
        <button
          type="button"
          onClick={() => create({})}
          disabled={isCreating}
          className="rounded bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {isCreating ? 'creating…' : '+ new claude session'}
        </button>
        <span className="text-xs text-white/40">no sessions yet</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#16161a] px-2 py-1">
      {sessions.map((s) => {
        const active = s.id === activeId
        return (
          <div
            key={s.id}
            className={`group flex shrink-0 items-center gap-2 rounded px-3 py-1 text-xs ${
              active
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:bg-white/5 hover:text-white/90'
            }`}
          >
            <button
              type="button"
              onClick={() => setActive(s.id)}
              className="flex items-center gap-2"
              title={`${s.name} · ${s.claudeConfigDir}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${stateColor(s.state)}`}
                aria-hidden
              />
              <span className="font-medium">{s.name}</span>
            </button>
            <button
              type="button"
              onClick={() => destroy(s.id)}
              className="text-white/30 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
              title="close session"
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => create({})}
        disabled={isCreating}
        className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/5 hover:text-white/90 disabled:opacity-50"
        title="new session"
      >
        +
      </button>
    </div>
  )
}

function stateColor(state: string | undefined): string {
  switch (state) {
    case 'generating':
      return 'bg-emerald-400'
    case 'thinking':
      return 'bg-yellow-400'
    case 'userInput':
      return 'bg-sky-400'
    case 'needsAttention':
      return 'bg-red-400'
    default:
      return 'bg-white/30'
  }
}
