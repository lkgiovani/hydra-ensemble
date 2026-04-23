import { useEffect, useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'

interface Props {
  sessionId: string
  onAttach: (paths: string[]) => void
}

/**
 * Fullscreen drop target overlay bound to the window.
 *
 * Listens to the window drag events so the user can drop files anywhere on
 * the chat surface. The overlay only becomes visible when the drag payload
 * actually carries files (we inspect `dataTransfer.types`), so regular
 * in-app drags (e.g. text selections from outside editors) don't steal the
 * view.
 *
 * Electron exposes the absolute filesystem path on the dropped `File`
 * object via the `.path` property when our security context permits it.
 * When the context is sandboxed and `.path` is absent we fall back to the
 * file name and emit a warning — the caller can decide whether to attach
 * the name only or prompt the user.
 */
export default function FileDropOverlay({ sessionId, onAttach }: Props) {
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearHide = (): void => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
    }

    const scheduleHide = (): void => {
      clearHide()
      hideTimer.current = setTimeout(() => {
        setVisible(false)
        hideTimer.current = null
      }, 500)
    }

    const hasFilePayload = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types
      if (!types) return false
      // DataTransfer.types is a DOMStringList-like — it supports `contains`
      // in some browsers and only indexed access in others. Normalise.
      const arr = Array.from(types as unknown as ArrayLike<string>)
      return arr.includes('Files') || arr.includes('text/plain')
    }

    const isInsideViewport = (e: DragEvent): boolean => {
      const x = e.clientX
      const y = e.clientY
      if (x < 0 || y < 0) return false
      if (x > window.innerWidth || y > window.innerHeight) return false
      return true
    }

    const onDragEnter = (e: DragEvent): void => {
      if (!hasFilePayload(e)) return
      e.preventDefault()
      clearHide()
      setVisible(true)
    }

    const onDragOver = (e: DragEvent): void => {
      if (!hasFilePayload(e)) return
      // preventDefault is required so the browser treats us as a drop target.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      clearHide()
      if (!visible) setVisible(true)
    }

    const onDragLeave = (e: DragEvent): void => {
      if (!hasFilePayload(e)) return
      // A dragleave fires whenever we cross a child boundary — we hide on a
      // timer so child->parent crossings don't flash the overlay.
      scheduleHide()
    }

    const onDrop = (e: DragEvent): void => {
      if (!hasFilePayload(e)) return
      e.preventDefault()
      clearHide()

      if (!isInsideViewport(e)) {
        setVisible(false)
        return
      }

      const files = e.dataTransfer?.files
      const paths: string[] = []
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const f = files.item(i)
          if (!f) continue
          // Electron augments File with `.path` (absolute filesystem path)
          // when contextIsolation permits. Sandboxed contexts strip it.
          const maybePath = (f as File & { path?: string }).path
          if (typeof maybePath === 'string' && maybePath.length > 0) {
            paths.push(maybePath)
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              '[FileDropOverlay] File.path unavailable (sandboxed context); falling back to name',
              { sessionId, name: f.name }
            )
            paths.push(f.name)
          }
        }
      }

      if (paths.length > 0) onAttach(paths)
      setVisible(false)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      clearHide()
    }
  }, [sessionId, onAttach, visible])

  if (!visible) return null

  return (
    <div
      className="df-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-bg-0/80 backdrop-blur-sm"
      aria-hidden="true"
    >
      <div
        className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-accent-500 bg-bg-1/40 text-accent-200"
        style={{
          width: 320,
          height: 240,
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <Paperclip size={28} strokeWidth={1.75} className="text-accent-400" />
        <span className="df-label text-text-1">Drop files to attach</span>
      </div>
    </div>
  )
}
