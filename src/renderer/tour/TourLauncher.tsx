import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, PlayCircle, X } from 'lucide-react'
import { useTours } from './state'
import { TOURS } from './tours'

/**
 * Single "Tutorial" button anchored bottom-right. Clicking it opens a
 * compact dropdown listing every available tour — one row per tour with
 * its title, description, and a ✓ mark on the ones the user already
 * completed. No more pile of raw buttons stacked in the corner.
 */
export default function TourLauncher(): React.ReactNode {
  const completedTours = useTours((s) => s.completedTours)
  const startTour = useTours((s) => s.startTour)
  const reset = useTours((s) => s.reset)
  const activeTourId = useTours((s) => s.activeTourId)

  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node | null
      if (
        popoverRef.current?.contains(target ?? null) ||
        buttonRef.current?.contains(target ?? null)
      ) {
        return
      }
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Hide the launcher entirely while a tour is playing so the popover
  // doesn't layer over the player's spotlight.
  if (activeTourId) return null

  const items = TOURS.map((t) => ({
    tour: t,
    completed: Boolean(completedTours[t.id])
  }))

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[55] flex items-center gap-1.5 rounded-full border border-border-mid bg-bg-2 px-3 py-1.5 text-[11px] text-text-1 shadow-pop transition hover:bg-bg-3 active:scale-95"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Guided tours"
      >
        <BookOpen size={13} strokeWidth={1.75} className="text-accent-400" />
        <span>Tutorial</span>
      </button>

      {open ? (
        <div
          ref={popoverRef}
          role="menu"
          aria-label="Guided tours"
          className="fixed bottom-16 right-4 z-[55] flex w-[320px] flex-col overflow-hidden rounded-sm border border-border-mid bg-bg-2 shadow-pop df-fade-in"
        >
          <div className="flex items-center justify-between border-b border-border-soft bg-bg-1 px-3 py-2">
            <div className="flex items-center gap-2">
              <BookOpen size={13} strokeWidth={1.75} className="text-accent-400" />
              <span className="df-label text-text-1">Guided tours</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
              aria-label="close"
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          </div>

          <div className="df-scroll max-h-[60vh] overflow-y-auto py-1">
            {items.map(({ tour, completed }) => (
              <button
                key={tour.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  startTour(tour.id)
                  setOpen(false)
                }}
                className="group flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-bg-3"
              >
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${
                    completed
                      ? 'bg-accent-500/15 text-accent-400'
                      : 'bg-bg-3 text-text-3 group-hover:bg-accent-500/15 group-hover:text-accent-400'
                  }`}
                >
                  {completed ? (
                    <Check size={12} strokeWidth={2.25} />
                  ) : (
                    <PlayCircle size={12} strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-text-1">
                      {tour.title}
                    </span>
                    <span className="font-mono text-[10px] text-text-4">
                      {tour.steps.length}{' '}
                      {tour.steps.length === 1 ? 'step' : 'steps'}
                    </span>
                  </div>
                  <div className="line-clamp-2 text-[11px] text-text-3">
                    {tour.description}
                  </div>
                  {completed ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-text-4">
                      Completed · click to replay
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>

          {Object.keys(completedTours).length > 0 ? (
            <div className="border-t border-border-soft bg-bg-1 px-3 py-2 text-[10px] text-text-4">
              <button
                type="button"
                onClick={() => reset()}
                className="hover:text-text-1"
              >
                Reset all tutorials
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
