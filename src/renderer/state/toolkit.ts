import { create } from 'zustand'
import type { ToolkitItem, ToolkitRunResult } from '../../shared/types'

export interface ToolkitRunState {
  status: 'running' | 'success' | 'error'
  result?: ToolkitRunResult
  startedAt: number
}

interface ToolkitState {
  items: ToolkitItem[]
  /** Editor dialog open flag. */
  editorOpen: boolean
  /** Last run state per item id (for the per-button popover). */
  runs: Record<string, ToolkitRunState | undefined>
  /** Which item id has its result popover open. */
  openPopoverId: string | null

  init(): Promise<void>
  refresh(): Promise<void>
  save(items: ToolkitItem[]): Promise<void>
  run(item: ToolkitItem, cwd: string): Promise<void>

  setOpenPopover(id: string | null): void
  openEditor(): void
  closeEditor(): void
}

export const useToolkit = create<ToolkitState>((set, get) => ({
  items: [],
  editorOpen: false,
  runs: {},
  openPopoverId: null,

  init: async () => {
    await get().refresh()
  },

  refresh: async () => {
    try {
      const items = await window.api.toolkit.list()
      set({ items })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[toolkit] list failed:', err)
      set({ items: [] })
    }
  },

  save: async (items) => {
    set({ items })
    try {
      await window.api.toolkit.save(items)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[toolkit] save failed:', err)
    }
  },

  run: async (item, cwd) => {
    set((prev) => ({
      runs: {
        ...prev.runs,
        [item.id]: { status: 'running', startedAt: Date.now() }
      },
      openPopoverId: item.id
    }))
    try {
      const result = await window.api.toolkit.run(item.id, cwd)
      const status: ToolkitRunState['status'] = result.exitCode === 0 ? 'success' : 'error'
      set((prev) => ({
        runs: {
          ...prev.runs,
          [item.id]: {
            status,
            result,
            startedAt: prev.runs[item.id]?.startedAt ?? Date.now()
          }
        }
      }))
    } catch (err) {
      set((prev) => ({
        runs: {
          ...prev.runs,
          [item.id]: {
            status: 'error',
            result: {
              exitCode: -1,
              stdout: '',
              stderr: err instanceof Error ? err.message : String(err),
              durationMs: 0
            },
            startedAt: prev.runs[item.id]?.startedAt ?? Date.now()
          }
        }
      }))
    }
  },

  setOpenPopover: (id) => set({ openPopoverId: id }),
  openEditor: () => set({ editorOpen: true }),
  closeEditor: () => set({ editorOpen: false })
}))
