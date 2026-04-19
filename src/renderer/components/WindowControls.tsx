import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { isMac } from '../lib/platform'

/**
 * Custom titlebar controls for tiling/decoration-less environments
 * (Hyprland, sway, etc.) where the OS doesn't draw a frame. macOS gets
 * its native traffic lights via titleBarStyle: 'hiddenInset' so we hide
 * these there.
 */
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    const t = setInterval(() => {
      void window.api.window.isMaximized().then(setMaximized)
    }, 1500)
    return () => clearInterval(t)
  }, [])

  if (isMac()) return null

  const min = (): void => {
    void window.api.window.minimize()
  }
  const tog = async (): Promise<void> => {
    const next = await window.api.window.maximizeToggle()
    setMaximized(next)
  }
  const close = (): void => {
    void window.api.window.close()
  }

  // The buttons need WebkitAppRegion: 'no-drag' so clicks register instead
  // of being eaten by the drag region applied to the parent header.
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

  return (
    <div className="flex shrink-0 items-stretch" style={noDrag}>
      <CtrlBtn onClick={min} title="minimize" Icon={Minus} />
      <CtrlBtn
        onClick={() => void tog()}
        title={maximized ? 'restore' : 'maximize'}
        Icon={maximized ? Copy : Square}
      />
      <CtrlBtn onClick={close} title="close" Icon={X} danger />
    </div>
  )
}

function CtrlBtn({
  onClick,
  title,
  Icon,
  danger
}: {
  onClick: () => void
  title: string
  Icon: typeof X
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-full w-10 items-center justify-center text-text-3 transition-colors ${
        danger ? 'hover:bg-status-attention/80 hover:text-white' : 'hover:bg-bg-3 hover:text-text-1'
      }`}
    >
      <Icon size={12} strokeWidth={1.75} />
    </button>
  )
}
