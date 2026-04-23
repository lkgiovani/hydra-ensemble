import { CSSProperties } from 'react'

interface Props {
  label?: string
  tone?: 'thinking' | 'generating' | 'userInput'
  compact?: boolean
}

const TONE_TIMING: Record<NonNullable<Props['tone']>, { duration: string; opacity: number; staticDots: boolean }> = {
  thinking: { duration: '1400ms', opacity: 0.65, staticDots: false },
  generating: { duration: '700ms', opacity: 0.95, staticDots: false },
  userInput: { duration: '0ms', opacity: 0.5, staticDots: true },
}

const DOT_DELAYS = ['0ms', '150ms', '300ms']

export default function TypingIndicator({ label, tone = 'thinking', compact }: Props) {
  const timing = TONE_TIMING[tone]
  const resolvedLabel = tone === 'userInput' ? label ?? 'Waiting for input…' : label ?? 'Claude is thinking…'

  const bubbleStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: compact ? 8 : 10,
    padding: compact ? '4px 10px' : '8px 14px',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: 'rgba(230, 230, 235, 0.85)',
    fontSize: compact ? 12 : 13,
    lineHeight: 1,
    maxWidth: 'fit-content',
  }

  const avatarStyle: CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--accent, #c96442)',
    flexShrink: 0,
    boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.04)',
  }

  const dotsWrapperStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }

  const dotBaseStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'currentColor',
    opacity: timing.opacity,
    display: 'inline-block',
  }

  const labelStyle: CSSProperties = {
    fontStyle: 'italic',
    color: 'rgba(200, 200, 210, 0.7)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={bubbleStyle} role="status" aria-live="polite" aria-label={resolvedLabel} data-tone={tone}>
      <style>{`
        @keyframes typingIndicatorBounce {
          0%, 60%, 100% { transform: scale(1); }
          30% { transform: scale(1.3); }
        }
        .typing-indicator-dot {
          animation-name: typingIndicatorBounce;
          animation-duration: var(--ti-duration, 1400ms);
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          transform-origin: center;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .typing-indicator-dot {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {!compact && <span style={avatarStyle} aria-hidden="true" />}

      <span style={dotsWrapperStyle} aria-hidden="true">
        {DOT_DELAYS.map((delay, index) => (
          <span
            key={index}
            className={timing.staticDots ? undefined : 'typing-indicator-dot'}
            style={
              {
                ...dotBaseStyle,
                animationDelay: delay,
                ['--ti-duration' as string]: timing.duration,
              } as CSSProperties
            }
          />
        ))}
      </span>

      <span style={labelStyle}>{resolvedLabel}</span>
    </div>
  )
}
