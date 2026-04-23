import * as React from 'react'

interface KbdProps {
  children: React.ReactNode
  size?: 'sm' | 'md'
}

const SIZE_CLASSES: Record<NonNullable<KbdProps['size']>, string> = {
  sm: 'px-1 py-0.5 text-[10px]',
  md: 'px-1.5 py-0.5 text-[11px]',
}

export default function Kbd(p: KbdProps) {
  const size = p.size ?? 'sm'
  return (
    <kbd
      className={`inline-flex items-center rounded-sm border border-border-mid bg-bg-3 font-mono text-text-2 ${SIZE_CLASSES[size]}`}
    >
      {p.children}
    </kbd>
  )
}
