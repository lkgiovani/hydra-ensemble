import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getTour } from './tours'

export interface TourState {
  activeTourId: string | null
  currentStep: number
  completedTours: Record<string, string>
  startTour: (id: string) => void
  advance: () => void
  back: () => void
  skip: () => void
  reset: (id?: string) => void
}

export const useTours = create<TourState>()(
  persist(
    (set, get) => ({
      activeTourId: null,
      currentStep: 0,
      completedTours: {},
      startTour: (id) => {
        const tour = getTour(id)
        if (!tour) return
        set({ activeTourId: id, currentStep: 0 })
      },
      advance: () => {
        const { activeTourId, currentStep, completedTours } = get()
        if (!activeTourId) return
        const tour = getTour(activeTourId)
        if (!tour) {
          set({ activeTourId: null, currentStep: 0 })
          return
        }
        const next = currentStep + 1
        if (next >= tour.steps.length) {
          set({
            activeTourId: null,
            currentStep: 0,
            completedTours: {
              ...completedTours,
              [activeTourId]: new Date().toISOString()
            }
          })
          return
        }
        set({ currentStep: next })
      },
      back: () => {
        const { currentStep } = get()
        if (currentStep <= 0) return
        set({ currentStep: currentStep - 1 })
      },
      skip: () => {
        set({ activeTourId: null, currentStep: 0 })
      },
      reset: (id) => {
        if (!id) {
          set({ activeTourId: null, currentStep: 0, completedTours: {} })
          return
        }
        const completedTours = { ...get().completedTours }
        delete completedTours[id]
        set({ completedTours })
      }
    }),
    {
      name: 'hydra.tours',
      partialize: (s) => ({ completedTours: s.completedTours })
    }
  )
)
