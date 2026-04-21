import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionMeta, ToolkitItem, WatchdogRule } from '../shared/types'
import {
  DEFAULT_ORCHESTRA_STATE,
  type OrchestraStoreSlice
} from '../shared/orchestra'

export type { ToolkitItem } from '../shared/types'

export interface SavedProject {
  path: string
  name: string
  lastOpenedAt: string
}

interface StoreShape {
  sessions: SessionMeta[]
  projects: SavedProject[]
  toolkit: ToolkitItem[]
  watchdogs: WatchdogRule[]
  orchestra: OrchestraStoreSlice
}

const DEFAULTS: StoreShape = {
  sessions: [],
  projects: [],
  toolkit: [],
  watchdogs: [],
  orchestra: DEFAULT_ORCHESTRA_STATE
}

let cachePath: string | null = null
let cache: StoreShape = DEFAULTS

export function initStore(): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  cachePath = join(dir, 'store.json')
  if (existsSync(cachePath)) {
    try {
      const raw = readFileSync(cachePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoreShape>
      cache = {
        sessions: parsed.sessions ?? [],
        projects: parsed.projects ?? [],
        toolkit: parsed.toolkit ?? [],
        watchdogs: parsed.watchdogs ?? [],
        orchestra: {
          ...DEFAULT_ORCHESTRA_STATE,
          ...(parsed.orchestra ?? {})
        }
      }
    } catch {
      cache = { ...DEFAULTS }
    }
  } else {
    cache = { ...DEFAULTS }
  }
}

export function getStore(): StoreShape {
  return cache
}

export function patchStore(patch: Partial<StoreShape>): void {
  cache = { ...cache, ...patch }
  flush()
}

function flush(): void {
  if (!cachePath) return
  try {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[store] flush failed:', (err as Error).message)
  }
}
