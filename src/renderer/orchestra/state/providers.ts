/**
 * Zustand slice that owns Orchestra's per-provider API key / auth configs.
 *
 * Persists under `hydra.orchestra.providers` with only the `configs` map
 * serialized. Secrets stored here are plaintext in localStorage — that's
 * acceptable for the modal's UX surface (user just pasted the key and
 * expects it to persist across reloads), but the runner itself should
 * prefer the main-side keychain path once wired. This slice is the
 * renderer's working copy, not the canonical vault.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  PROVIDERS,
  defaultProviderConfig,
  type ProviderConfig,
  type ProviderId
} from '../../../shared/providers'

interface PersistedView {
  configs: Record<ProviderId, ProviderConfig>
}

interface ProvidersState extends PersistedView {
  setConfig: (patch: ProviderConfig) => void
  toggleEnabled: (id: ProviderId, next?: boolean) => void
  clearValue: (id: ProviderId) => void
  getValue: (id: ProviderId) => string | undefined
}

/** Seed every known provider with its default config so consumers never
 *  have to null-check `configs[id]`. Keeps the store stable across adds
 *  to the PROVIDERS catalog in future versions. */
function seedConfigs(): Record<ProviderId, ProviderConfig> {
  const out = {} as Record<ProviderId, ProviderConfig>
  for (const p of PROVIDERS) {
    out[p.id] = defaultProviderConfig(p.id)
  }
  return out
}

export const useProviders = create<ProvidersState>()(
  persist(
    (set, get) => ({
      configs: seedConfigs(),

      setConfig: (patch) => {
        set((s) => ({
          configs: {
            ...s.configs,
            [patch.id]: {
              ...s.configs[patch.id],
              ...patch
            }
          }
        }))
      },

      toggleEnabled: (id, next) => {
        set((s) => {
          const current = s.configs[id] ?? defaultProviderConfig(id)
          const enabled = typeof next === 'boolean' ? next : !current.enabled
          return {
            configs: {
              ...s.configs,
              [id]: { ...current, enabled }
            }
          }
        })
      },

      clearValue: (id) => {
        set((s) => {
          const current = s.configs[id] ?? defaultProviderConfig(id)
          return {
            configs: {
              ...s.configs,
              [id]: { ...current, value: undefined }
            }
          }
        })
      },

      getValue: (id) => get().configs[id]?.value
    }),
    {
      name: 'hydra.orchestra.providers',
      storage: createJSONStorage(() => localStorage),
      // Only persist `configs`. Action functions are re-attached on
      // rehydrate by zustand itself.
      partialize: (s) => ({ configs: s.configs }) satisfies PersistedView,
      // Future versions may reshuffle PROVIDERS; merge the persisted blob
      // onto freshly-seeded defaults so newly-added providers still
      // appear even on stale stores.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedView>
        return {
          ...current,
          configs: {
            ...current.configs,
            ...(p.configs ?? {})
          }
        }
      }
    }
  )
)
