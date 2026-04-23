import * as React from 'react'

interface SectionProps {
  title: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  tone?: 'neutral' | 'danger'
}

export default function Section(p: SectionProps) {
  const tone = p.tone ?? 'neutral'
  const borderClass = tone === 'danger' ? 'border-red-500/40' : 'border-border-mid'
  const titleClass = tone === 'danger' ? 'text-red-400' : 'text-text-1'

  return (
    <section className={`rounded-md border ${borderClass} bg-bg-1`}>
      <header className="flex items-center gap-2 border-b border-border-mid px-3 py-2">
        {p.icon ? <span className="inline-flex text-text-2">{p.icon}</span> : null}
        <h3 className={`flex-1 truncate text-xs font-medium uppercase tracking-wide ${titleClass}`}>
          {p.title}
        </h3>
        {p.actions ? <div className="inline-flex items-center gap-1">{p.actions}</div> : null}
      </header>
      <div className="px-3 py-3 text-sm text-text-1">{p.children}</div>
    </section>
  )
}
