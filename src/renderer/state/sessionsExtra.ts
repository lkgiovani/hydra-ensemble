import { create } from 'zustand'

interface SessionsUiState {
  dashboardOpen: boolean
  openDashboard: () => void
  closeDashboard: () => void
  toggleDashboard: () => void
}

export const useSessionsUi = create<SessionsUiState>((set) => ({
  dashboardOpen: false,
  openDashboard: () => set({ dashboardOpen: true }),
  closeDashboard: () => set({ dashboardOpen: false }),
  toggleDashboard: () => set((prev) => ({ dashboardOpen: !prev.dashboardOpen }))
}))
