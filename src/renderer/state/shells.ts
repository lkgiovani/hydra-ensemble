import { create } from 'zustand'

/**
 * Plain shell terminals — the kind you spawn to run `npm run dev`,
 * `tail -f log`, `htop`, or any side process you want to keep tabs on
 * while your Claude agents do their thing. Independent from `session`
 * (which always exec's claude inside).
 *
 * Each shell is a thin record over a PTY id. The PTY itself is owned
 * by main's PtyManager and survives renderer reloads via the same
 * subscription contract as session PTYs.
 */
export interface Shell {
  id: string // ptyId
  name: string
  cwd: string
  createdAt: number
}

interface ShellsState {
  shells: Shell[]
  activeId: string | null
  setActive: (id: string | null) => void
  spawn: (cwd: string, name?: string) => Promise<Shell | null>
  destroy: (id: string) => Promise<void>
  rename: (id: string, name: string) => void
}

let _seq = 0
const newId = (): string =>
  `shell-${Date.now().toString(36)}-${(++_seq).toString(36)}`

export const useShells = create<ShellsState>((set, get) => ({
  shells: [],
  activeId: null,

  setActive: (id) => set({ activeId: id }),

  spawn: async (cwd, name) => {
    const id = newId()
    const result = await window.api.pty.write !== undefined
      ? await window.api.session.create({
          name: name ?? `shell-${get().shells.length + 1}`,
          cwd,
          cols: 120,
          rows: 30,
          shellOnly: true
        })
      : null
    if (!result || !result.ok) {
      // eslint-disable-next-line no-console
      console.error('[shells] spawn failed', result)
      return null
    }
    // Reuse the session's ptyId as the shell id so writes/data flow naturally.
    const shell: Shell = {
      id: result.session.ptyId,
      name: result.session.name,
      cwd,
      createdAt: Date.now()
    }
    set((s) => ({ shells: [...s.shells, shell], activeId: shell.id }))
    return shell
  },

  destroy: async (id) => {
    // Find the underlying session id (ptyId === sessionId in our wiring).
    await window.api.session.destroy(id)
    set((s) => {
      const shells = s.shells.filter((sh) => sh.id !== id)
      const activeId =
        s.activeId === id ? (shells[shells.length - 1]?.id ?? null) : s.activeId
      return { shells, activeId }
    })
  },

  rename: (id, name) => {
    set((s) => ({
      shells: s.shells.map((sh) => (sh.id === id ? { ...sh, name } : sh))
    }))
  }
}))
