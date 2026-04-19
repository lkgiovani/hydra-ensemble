import { create } from 'zustand'
import type { ProjectMeta, Worktree } from '../../shared/types'

interface ProjectsState {
  projects: ProjectMeta[]
  currentPath: string | null
  worktrees: Worktree[]
  loadingWorktrees: boolean
  error: string | null
  init(): Promise<void>
  refresh(): Promise<void>
  addProject(): Promise<void>
  removeProject(path: string): Promise<void>
  setCurrent(path: string): Promise<void>
  refreshWorktrees(): Promise<void>
  createWorktree(name: string, baseBranch?: string): Promise<void>
  removeWorktree(path: string): Promise<void>
}

const safe = async <T,>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> => {
  try {
    return await fn()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[projects] ${label} failed:`, err)
    return fallback
  }
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  currentPath: null,
  worktrees: [],
  loadingWorktrees: false,
  error: null,

  init: async () => {
    try {
      const [projects, current] = await Promise.all([
        window.api.project.list(),
        window.api.project.current()
      ])
      set({ projects, currentPath: current?.path ?? projects[0]?.path ?? null, error: null })
      window.api.project.onChange((next) => {
        set((prev) => {
          const stillExists = prev.currentPath && next.some((p) => p.path === prev.currentPath)
          return {
            projects: next,
            currentPath: stillExists ? prev.currentPath : (next[0]?.path ?? null)
          }
        })
        void get().refreshWorktrees()
      })
      await get().refreshWorktrees()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // eslint-disable-next-line no-console
      console.warn('[projects] init failed:', err)
      set({ projects: [], currentPath: null, error: message })
    }
  },

  refresh: async () => {
    const projects = await safe(() => window.api.project.list(), [], 'list')
    set({ projects })
    await get().refreshWorktrees()
  },

  addProject: async () => {
    const dir = await safe(() => window.api.project.pickDirectory(), null, 'pickDirectory')
    if (!dir) return
    const meta = await safe(() => window.api.project.add(dir), null, 'add')
    if (!meta) return
    set((prev) => {
      const existing = prev.projects.filter((p) => p.path !== meta.path)
      return { projects: [meta, ...existing], currentPath: meta.path }
    })
    await safe(() => window.api.project.setCurrent(meta.path), undefined, 'setCurrent')
    await get().refreshWorktrees()
  },

  removeProject: async (path) => {
    await safe(() => window.api.project.remove(path), undefined, 'remove')
    set((prev) => {
      const projects = prev.projects.filter((p) => p.path !== path)
      const currentPath =
        prev.currentPath === path ? (projects[0]?.path ?? null) : prev.currentPath
      return { projects, currentPath, worktrees: prev.currentPath === path ? [] : prev.worktrees }
    })
    if (get().currentPath) await get().refreshWorktrees()
  },

  setCurrent: async (path) => {
    set({ currentPath: path })
    await safe(() => window.api.project.setCurrent(path), undefined, 'setCurrent')
    await get().refreshWorktrees()
  },

  refreshWorktrees: async () => {
    const cwd = get().currentPath
    if (!cwd) {
      set({ worktrees: [], loadingWorktrees: false })
      return
    }
    set({ loadingWorktrees: true })
    const result = await safe(
      () => window.api.git.listWorktrees(cwd),
      { ok: false as const, error: 'unavailable' },
      'listWorktrees'
    )
    if (result.ok) {
      set({ worktrees: result.value, loadingWorktrees: false })
    } else {
      set({ worktrees: [], loadingWorktrees: false })
    }
  },

  createWorktree: async (name, baseBranch) => {
    const cwd = get().currentPath
    if (!cwd) return
    const repoRoot = await safe(() => window.api.git.repoRoot(cwd), cwd, 'repoRoot')
    const root = repoRoot ?? cwd
    const trimmed = name.trim()
    if (!trimmed) return
    const result = await safe(
      () => window.api.git.createWorktree(root, trimmed, baseBranch?.trim() || undefined),
      { ok: false as const, error: 'unavailable' },
      'createWorktree'
    )
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn('[projects] createWorktree failed:', result.error)
    }
    await get().refreshWorktrees()
  },

  removeWorktree: async (path) => {
    const cwd = get().currentPath
    if (!cwd) return
    const repoRoot = await safe(() => window.api.git.repoRoot(cwd), cwd, 'repoRoot')
    const root = repoRoot ?? cwd
    const result = await safe(
      () => window.api.git.removeWorktree(root, path),
      { ok: false as const, error: 'unavailable' },
      'removeWorktree'
    )
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn('[projects] removeWorktree failed:', result.error)
    }
    await get().refreshWorktrees()
  }
}))
