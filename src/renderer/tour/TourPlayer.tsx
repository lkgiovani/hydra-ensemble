import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, SkipForward, X } from 'lucide-react'
import { useTours } from './state'
import { getTour, type TourStep } from './tours'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const CARD_WIDTH = 340
const CARD_GAP = 16
const HALO_PAD = 8

function useTargetRect(selector: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null)
      return
    }
    let raf = 0
    const measure = (): void => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`)
      if (!el) {
        setRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    const onResize = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    const interval = window.setInterval(measure, 500)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      window.clearInterval(interval)
    }
  }, [selector])

  return rect
}

function cardPosition(
  rect: Rect | null,
  placement: TourStep['placement']
): { top: number; left: number; centered: boolean } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!rect || placement === 'center') {
    return {
      top: Math.max(16, vh / 2 - 140),
      left: Math.max(16, vw / 2 - CARD_WIDTH / 2),
      centered: true
    }
  }
  const place = placement ?? 'bottom'
  let top = rect.top
  let left = rect.left
  if (place === 'bottom') {
    top = rect.top + rect.height + CARD_GAP
    left = rect.left + rect.width / 2 - CARD_WIDTH / 2
  } else if (place === 'top') {
    top = rect.top - CARD_GAP - 260
    left = rect.left + rect.width / 2 - CARD_WIDTH / 2
  } else if (place === 'right') {
    top = rect.top + rect.height / 2 - 120
    left = rect.left + rect.width + CARD_GAP
  } else if (place === 'left') {
    top = rect.top + rect.height / 2 - 120
    left = rect.left - CARD_WIDTH - CARD_GAP
  }
  left = Math.max(12, Math.min(left, vw - CARD_WIDTH - 12))
  top = Math.max(12, Math.min(top, vh - 260 - 12))
  return { top, left, centered: false }
}

function AnimationZone({ kind }: { kind: TourStep['animation'] }): React.ReactNode {
  const base = 'relative h-20 w-[120px] rounded-md border border-white/10 bg-white/5 overflow-hidden'
  if (kind === 'type') {
    return (
      <div className={base}>
        <div className="absolute inset-0 flex items-center px-3">
          <span className="font-mono text-[11px] text-white/80 tour-typed" />
          <span className="ml-0.5 inline-block h-3 w-[2px] bg-white/80 tour-caret" />
        </div>
      </div>
    )
  }
  if (kind === 'drag') {
    return (
      <div className={base}>
        <div className="absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white/70" />
        <div className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-white/40" />
        <svg viewBox="0 0 120 80" className="absolute inset-0 tour-drag-cursor">
          <path d="M0 0 L10 14 L4 14 L8 22 L5 23 L1 15 L0 18 Z" fill="#fff" />
        </svg>
      </div>
    )
  }
  if (kind === 'highlight') {
    return (
      <div className={base}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full bg-accent/20 tour-pulse" />
        </div>
      </div>
    )
  }
  // click (default)
  return (
    <div className={base}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-10 w-16 rounded bg-white/10" />
      </div>
      <svg viewBox="0 0 120 80" className="absolute inset-0 tour-click-cursor">
        <circle className="tour-click-ripple" cx="60" cy="40" r="4" fill="none" stroke="#fff" strokeOpacity="0.8" />
        <path d="M0 0 L10 14 L4 14 L8 22 L5 23 L1 15 L0 18 Z" fill="#fff" transform="translate(52 32)" />
      </svg>
    </div>
  )
}

const STYLES = `
@keyframes tour-halo-pulse { 0%,100% { box-shadow: 0 0 0 2px rgba(125,211,252,0.9), 0 0 0 8px rgba(125,211,252,0.25);} 50% { box-shadow: 0 0 0 2px rgba(125,211,252,1), 0 0 0 14px rgba(125,211,252,0.08);} }
@keyframes tour-click-move { 0% { transform: translate(-20px,-10px);} 60% { transform: translate(0,0);} 100% { transform: translate(0,0);} }
@keyframes tour-click-press { 0%,55% { transform: scale(1);} 65% { transform: scale(0.85);} 100% { transform: scale(1);} }
@keyframes tour-ripple { 0%,60% { r: 4; opacity: 0;} 75% { r: 14; opacity: 0.8;} 100% { r: 22; opacity: 0;} }
@keyframes tour-caret-blink { 0%,50% { opacity: 1;} 51%,100% { opacity: 0;} }
@keyframes tour-type { 0% { width: 0;} 80%,100% { width: 100px;} }
@keyframes tour-drag-move { 0% { transform: translate(8px,26px);} 80% { transform: translate(92px,26px);} 100% { transform: translate(92px,26px);} }
@keyframes tour-pulse-ring { 0%,100% { transform: scale(1); opacity: 0.5;} 50% { transform: scale(1.35); opacity: 1;} }
.tour-halo { animation: tour-halo-pulse 1200ms ease-in-out infinite; }
.tour-click-cursor { animation: tour-click-move 1200ms ease-in-out infinite, tour-click-press 1200ms ease-in-out infinite; transform-origin: 60px 40px; }
.tour-click-ripple { animation: tour-ripple 1200ms ease-out infinite; }
.tour-caret { animation: tour-caret-blink 1000ms steps(2) infinite; }
.tour-typed { display: inline-block; overflow: hidden; white-space: nowrap; animation: tour-type 1200ms steps(12) infinite; }
.tour-typed::before { content: 'hello hydra'; }
.tour-drag-cursor { animation: tour-drag-move 1200ms ease-in-out infinite; }
.tour-pulse { animation: tour-pulse-ring 1200ms ease-in-out infinite; }
`

export default function TourPlayer(): React.ReactNode {
  const activeTourId = useTours((s) => s.activeTourId)
  const currentStep = useTours((s) => s.currentStep)
  const advance = useTours((s) => s.advance)
  const back = useTours((s) => s.back)
  const skip = useTours((s) => s.skip)

  const tour = useMemo(() => (activeTourId ? getTour(activeTourId) : undefined), [activeTourId])
  const step: TourStep | undefined = tour?.steps[currentStep]
  const rect = useTargetRect(step?.target)

  useEffect(() => {
    if (!activeTourId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skip()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        advance()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTourId, advance, back, skip])

  if (!tour || !step) return null

  const pos = cardPosition(rect, step.placement)
  const isFirst = currentStep === 0
  const isLast = currentStep === tour.steps.length - 1
  const showHalo = !!rect && step.placement !== 'center'

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={tour.title}>
      <style>{STYLES}</style>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => advance()}
      />

      {showHalo && rect && (
        <div
          className="pointer-events-none absolute rounded-lg tour-halo"
          style={{
            top: rect.top - HALO_PAD,
            left: rect.left - HALO_PAD,
            width: rect.width + HALO_PAD * 2,
            height: rect.height + HALO_PAD * 2
          }}
        />
      )}

      <div
        className="absolute w-[340px] rounded-xl border border-white/10 bg-[#1a1d23] p-4 shadow-2xl"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-white/40">
              {tour.title} · {currentStep + 1}/{tour.steps.length}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold text-white">{step.title}</div>
          </div>
          <button
            onClick={skip}
            aria-label="Skip tour"
            className="rounded p-1 text-white/50 hover:bg-white/5 hover:text-white/80"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mb-3 flex gap-3">
          <AnimationZone kind={step.animation ?? 'highlight'} />
          <p className="flex-1 text-[13px] leading-snug text-white/75">{step.body}</p>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={skip}
            className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-white/50 hover:text-white/80"
          >
            <SkipForward size={12} /> Skip
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={back}
                className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1 text-[12px] text-white/80 hover:bg-white/5"
              >
                <ChevronLeft size={12} /> Back
              </button>
            )}
            <button
              onClick={advance}
              className="flex items-center gap-1 rounded bg-accent px-3 py-1 text-[12px] font-medium text-black hover:brightness-110"
            >
              {isFirst ? 'Start' : isLast ? 'Done' : 'Next'}
              {!isLast && <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
