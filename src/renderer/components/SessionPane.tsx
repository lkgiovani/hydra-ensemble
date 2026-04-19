import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { SessionMeta } from '../../shared/types'

interface Props {
  session: SessionMeta
  visible: boolean
}

/**
 * Attaches an xterm.js view to an existing PTY identified by `session.ptyId`.
 * The PTY is created/destroyed by the main-process SessionManager — this
 * component only renders the byte stream and forwards keystrokes/resizes.
 */
export default function SessionPane({ session, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily:
        'ui-monospace, "JetBrains Mono", "IBM Plex Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#0d0d0f',
        foreground: '#e6e6e6',
        cursor: '#7aa2f7',
        selectionBackground: '#33415540'
      },
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10_000,
      convertEol: false
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    termRef.current = term
    fitRef.current = fit

    const ptyId = session.ptyId
    let disposed = false

    const fitSafely = (): void => {
      try {
        fit.fit()
      } catch {
        // container may not be sized yet
      }
    }

    const offData = window.api.pty.onData((evt) => {
      if (evt.sessionId === ptyId) term.write(evt.data)
    })
    const offExit = window.api.pty.onExit((evt) => {
      if (evt.sessionId === ptyId) {
        term.writeln(
          `\r\n\x1b[33m[hydra-ensemble] pty exited (code=${evt.exitCode}${
            evt.signal ? `, signal=${evt.signal}` : ''
          })\x1b[0m`
        )
      }
    })

    const onInput = term.onData((data) => {
      void window.api.pty.write(ptyId, data)
    })

    const ro = new ResizeObserver(() => {
      fitSafely()
      void window.api.pty.resize(ptyId, term.cols, term.rows)
    })
    ro.observe(container)

    return () => {
      disposed = true
      ro.disconnect()
      offData()
      offExit()
      onInput.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      void disposed
    }
  }, [session.ptyId])

  // Re-fit when this pane becomes visible (it may have been hidden).
  useEffect(() => {
    if (!visible) return
    const fit = fitRef.current
    const term = termRef.current
    if (!fit || !term) return
    try {
      fit.fit()
      void window.api.pty.resize(session.ptyId, term.cols, term.rows)
      term.focus()
    } catch {
      // noop
    }
  }, [visible, session.ptyId])

  return <div ref={containerRef} className="h-full w-full" />
}
