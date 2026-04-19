import { useMemo } from 'react'
import { marked } from 'marked'

interface Props {
  markdown: string
}

// Light config — GFM tables/footnotes, no silent throw on bad input.
marked.setOptions({ gfm: true, breaks: false })

export default function MarkdownPreview({ markdown }: Props) {
  const html = useMemo(() => marked.parse(markdown) as string, [markdown])
  return (
    <div className="df-scroll h-full w-full overflow-auto rounded-sm border border-border-soft bg-bg-1 px-6 py-5">
      <article
        className="df-md prose-invert mx-auto max-w-3xl text-sm leading-relaxed text-text-2"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
