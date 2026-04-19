import type { SessionState } from '../../shared/types'

interface Props {
  state: SessionState | undefined
  label?: boolean
}

interface Style {
  dot: string
  text: string
  bg: string
  label: string
}

const STYLES: Record<SessionState, Style> = {
  idle: {
    dot: 'bg-white/40',
    text: 'text-white/60',
    bg: 'bg-white/5',
    label: 'idle'
  },
  thinking: {
    dot: 'bg-yellow-400',
    text: 'text-yellow-300',
    bg: 'bg-yellow-400/10',
    label: 'thinking'
  },
  generating: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    bg: 'bg-emerald-400/10',
    label: 'generating'
  },
  userInput: {
    dot: 'bg-sky-400',
    text: 'text-sky-300',
    bg: 'bg-sky-400/10',
    label: 'awaiting input'
  },
  needsAttention: {
    dot: 'bg-red-400',
    text: 'text-red-300',
    bg: 'bg-red-400/10',
    label: 'needs attention'
  }
}

const UNKNOWN: Style = {
  dot: 'bg-white/30',
  text: 'text-white/50',
  bg: 'bg-white/5',
  label: 'unknown'
}

export default function SessionStatePill({ state, label = true }: Props) {
  const style = state ? STYLES[state] : UNKNOWN
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.bg} ${style.text}`}
      title={style.label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {label && <span>{style.label}</span>}
    </span>
  )
}
