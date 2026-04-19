import { create } from 'zustand'
import type { PRDetail, PRInfo } from '../../shared/types'

interface GhState {
  open: boolean
  cwd: string | null
  prs: PRInfo[]
  loading: boolean
  error: string | null
  selected: PRDetail | null
  selectedLoading: boolean
  expandedNumber: number | null

  openPanel: (cwd: string) => void
  closePanel: () => void
  refresh: () => Promise<void>
  selectPR: (number: number) => Promise<void>
  collapsePR: () => void
}

export const useGh = create<GhState>((set, get) => ({
  open: false,
  cwd: null,
  prs: [],
  loading: false,
  error: null,
  selected: null,
  selectedLoading: false,
  expandedNumber: null,

  openPanel: (cwd) => {
    set({ open: true, cwd })
    void get().refresh()
  },

  closePanel: () => {
    set({ open: false, expandedNumber: null, selected: null })
  },

  refresh: async () => {
    const cwd = get().cwd
    if (!cwd) return
    set({ loading: true, error: null })
    const res = await window.api.gh.listPRs(cwd)
    if (res.ok) {
      set({ prs: res.value, loading: false })
    } else {
      set({ prs: [], loading: false, error: res.error })
    }
  },

  selectPR: async (number) => {
    const cwd = get().cwd
    if (!cwd) return
    set({ expandedNumber: number, selectedLoading: true, selected: null })
    const res = await window.api.gh.getPR(cwd, number)
    if (res.ok) {
      set({ selected: res.value, selectedLoading: false })
    } else {
      set({ selected: null, selectedLoading: false, error: res.error })
    }
  },

  collapsePR: () => set({ expandedNumber: null, selected: null })
}))
