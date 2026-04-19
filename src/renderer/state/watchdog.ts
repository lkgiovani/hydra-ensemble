import { create } from 'zustand'
import type { WatchdogFireEvent, WatchdogRule } from '../../shared/types'

export interface WatchdogLogEntry extends WatchdogFireEvent {
  /** Human-friendly cached rule name at the time of the fire. */
  ruleName: string
}

interface WatchdogState {
  rules: WatchdogRule[]
  panelOpen: boolean
  /** Form open for a specific rule id, 'new' for a brand-new rule, or null. */
  editingId: string | null | 'new'
  log: WatchdogLogEntry[]

  init(): Promise<void>
  refresh(): Promise<void>
  save(rules: WatchdogRule[]): Promise<void>
  toggle(id: string): Promise<void>
  upsert(rule: WatchdogRule): Promise<void>
  remove(id: string): Promise<void>

  openPanel(): void
  closePanel(): void
  togglePanel(): void
  startEdit(id: string | 'new'): void
  cancelEdit(): void
}

const LOG_CAP = 200

export const useWatchdog = create<WatchdogState>((set, get) => ({
  rules: [],
  panelOpen: false,
  editingId: null,
  log: [],

  init: async () => {
    await get().refresh()
    window.api.watchdog.onFire((event) => {
      const rule = get().rules.find((r) => r.id === event.ruleId)
      const entry: WatchdogLogEntry = {
        ...event,
        ruleName: rule?.name ?? event.ruleId
      }
      set((prev) => ({
        log: [entry, ...prev.log].slice(0, LOG_CAP)
      }))
    })
  },

  refresh: async () => {
    try {
      const rules = await window.api.watchdog.list()
      set({ rules })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[watchdog] list failed:', err)
      set({ rules: [] })
    }
  },

  save: async (rules) => {
    set({ rules })
    try {
      await window.api.watchdog.save(rules)
      // Re-pull in case the main side auto-disabled an invalid rule.
      await get().refresh()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[watchdog] save failed:', err)
    }
  },

  toggle: async (id) => {
    const next = get().rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    await get().save(next)
  },

  upsert: async (rule) => {
    const exists = get().rules.some((r) => r.id === rule.id)
    const next = exists
      ? get().rules.map((r) => (r.id === rule.id ? rule : r))
      : [...get().rules, rule]
    await get().save(next)
  },

  remove: async (id) => {
    const next = get().rules.filter((r) => r.id !== id)
    await get().save(next)
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false, editingId: null }),
  togglePanel: () => set((prev) => ({ panelOpen: !prev.panelOpen })),
  startEdit: (id) => set({ editingId: id }),
  cancelEdit: () => set({ editingId: null })
}))
