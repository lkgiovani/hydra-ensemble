import { useMemo } from 'react'
import { marked } from 'marked'
import { useEditor } from '../../state/editor'

// Initialize once at module load. GFM for fenced code blocks + tables,
// breaks:true so single newlines in claude's output become <br> (the
// terminal renders them literally, we want the same reading experience).
marked.use({ gfm: true, breaks: true })

interface Props {
  text: string
}

/**
 * Render claude's markdown into the surrounding chat layout. After the
 * markdown pass we scan the HTML for file-path-like tokens and wrap
 * them in clickable spans — clicks open the file in the built-in
 * editor slide panel. Keeps the UX close to VSCode's "ctrl-click a
 * path" behaviour without needing to embed a full ghost editor.
 *
 * Paths we detect:
 *   - relative with a slash and an extension (src/foo.ts, pkg/a/b.rs)
 *   - trailing :line or :line-endLine (src/foo.ts:42, src/foo.ts:42-51)
 *
 * We skip absolute paths on purpose — they're either host-specific
 * (/etc/...) or already rendered by claude as markdown links.
 */
export default function ChatMarkdown({ text }: Props) {
  const openEditor = useEditor((s) => s.openEditor)
  const openFile = useEditor((s) => s.openFile)

  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string
    // Conservative file-ref regex: letters/digits/underscore/dash, at
    // least one slash, and a dotted extension, with optional :line[-end].
    // Runs only on plain-text nodes (outside tag attributes) by matching
    // after a tag close or whitespace.
    const withRefs = raw.replace(
      /(^|[>\s(])([a-zA-Z0-9_.\-/]+\/[a-zA-Z0-9_.\-]+\.[a-zA-Z]{1,6})(:\d+(?:-\d+)?)?/g,
      (_m, lead: string, path: string, line: string | undefined) => {
        const display = line ? path + line : path
        return `${lead}<a class="df-file-ref" data-path="${path}">${display}</a>`
      }
    )
    return withRefs
  }, [text])

  const onClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement
    const link = target.closest('a.df-file-ref') as HTMLAnchorElement | null
    if (!link) return
    const path = link.dataset['path']
    if (!path) return
    e.preventDefault()
    // Heuristic: resolve against the session's cwd via the editor
    // bridge. The editor store already handles workspace-root resolution
    // through `readFile`. We pass the raw path; if it's truly relative
    // the main process joins it with the focused project.
    void openFile(path)
    openEditor()
  }

  return (
    <div
      className="df-md prose-chat"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
