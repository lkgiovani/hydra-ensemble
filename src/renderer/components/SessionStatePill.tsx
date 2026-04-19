import type { SessionState } from '../../shared/types'

interface Props {
  state: SessionState | undefined
  label?: boolean
}

interface Style {
  dot: string
  text: string
  bg: string
  ring: string
  label: string
  pulse: boolean
}

const STYLES: Record<SessionState, Style> = {
  idle: {
    dot: 'bg-status-idle',
    text: 'text-text-3',
    bg: 'bg-bg-3',
    ring: 'ring-border-soft',
    label: 'idle',
    pulse: false
  },
  thinking: {
    dot: 'bg-status-thinking',
    text: 'text-status-thinking',
    bg: 'bg-status-thinking/10',
    ring: 'ring-status-thinking/25',
    label: 'thinking',
    pulse: true
  },
  generating: {
    dot: 'bg-status-generating',
    text: 'text-status-generating',
    bg: 'bg-status-generating/10',
    ring: 'ring-status-generating/25',
    label: 'generating',
    pulse: true
  },
  userInput: {
    dot: 'bg-status-input',
    text: 'text-status-input',
    bg: 'bg-status-input/10',
    ring: 'ring-status-input/25',
    label: 'awaiting input',
    pulse: false
  },
  needsAttention: {
    dot: 'bg-status-attention',
    text: 'text-status-attention',
    bg: 'bg-status-attention/10',
    ring: 'ring-status-attention/30',
    label: 'needs attention',
    pulse: false
  }
}

const UNKNOWN: Style = {
  dot: 'bg-text-4',
  text: 'text-text-4',
  bg: 'bg-bg-3',
  ring: 'ring-border-soft',
  label: 'unknown',
  pulse: false
}

export default function SessionStatePill({ state, label = true }: Props) {
  const style = state ? STYLES[state] : UNKNOWN

  if (!label) {
    // Compact dot variant — used inside dense rows like SessionTabs / sidebar.
    return (
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${
          style.pulse ? 'df-pulse' : ''
        }`}
        title={style.label}
        aria-label={style.label}
      />
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-tight ${style.text}`}
      title={style.label}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${style.dot} ${style.pulse ? 'df-pulse' : ''}`}
        aria-hidden
      />
      <span className="lowercase">{style.label}</span>
    </span>
  )
}
