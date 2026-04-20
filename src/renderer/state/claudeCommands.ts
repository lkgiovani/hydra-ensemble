import { create } from 'zustand'
import type { ClaudeCommand } from '../../shared/types'

export interface ClaudeCommandsEntry {
  commands: ClaudeCommand[]
  loading: boolean
}

interface ClaudeCommandsState {
  byCwd: Record<string, ClaudeCommandsEntry>
  refresh(cwd: string | null): Promise<void>
}

export const useClaudeCommands = create<ClaudeCommandsState>((set) => ({
  byCwd: {},

  refresh: async (cwd) => {
    const key = cwd ?? ''
    set((s) => ({
      byCwd: {
        ...s.byCwd,
        [key]: { commands: s.byCwd[key]?.commands ?? [], loading: true }
      }
    }))
    try {
      const payload = await window.api.claude.listCommands(cwd)
      set((s) => ({
        byCwd: {
          ...s.byCwd,
          [key]: { commands: payload.commands, loading: false }
        }
      }))
    } catch {
      set((s) => ({
        byCwd: {
          ...s.byCwd,
          [key]: { commands: s.byCwd[key]?.commands ?? [], loading: false }
        }
      }))
    }
  }
}))
