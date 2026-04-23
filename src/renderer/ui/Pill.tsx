import * as React from 'react'

type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

interface PillProps {
  tone?: PillTone
  children: React.ReactNode
  compact?: boolean
}

const TONE_CLASSES: Record<PillTone, string> = {
  neutral: 'bg-bg-3 text-text-2 border border-border-mid',
  accent: 'bg-accent-500/15 text-accent-500 border border-accent-500/30',
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

export default function Pill(p: PillProps) {
  const tone = p.tone ?? 'neutral'
  const shape = p.compact ? 'rounded-sm px-1.5 py-0.5 text-[10px]' : 'rounded-full px-2 py-0.5 text-[11px]'
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium uppercase tracking-wide ${shape} ${TONE_CLASSES[tone]}`}
    >
      {p.children}
    </span>
  )
}
