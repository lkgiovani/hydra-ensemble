/**
 * TeamProviderPicker — compact "provider per team" selector for SettingsPanel.
 *
 * Orchestra supports multiple model providers (see `shared/providers.ts` and
 * `orchestra/state/providers.ts`). Each team eventually needs its own provider
 * binding so agents inside the team know which credentials/env to use.
 *
 * The canonical `Team` aggregate in `shared/orchestra.ts` does NOT yet carry a
 * `teamProvider` field — a follow-up migration will move the binding onto the
 * team record and drop the local slice below. Until then, we persist the
 * binding in a tiny renderer-only zustand slice keyed by teamId so this
 * component ships independently without a schema change.
 *
 * Integration:
 * - Options are sourced from `PROVIDERS` (the shared catalog). Unsupported
 *   entries render as disabled "(coming soon)" options so the picker matches
 *   what ProvidersDialog exposes.
 * - When a provider is picked we call `setBinding(teamId, id)` and surface a
 *   toast confirming the switch. The runner will read `useTeamProviderBinding`
 *   at dispatch time to resolve the right `ProviderConfig` from
 *   `useProviders`.
 * - Help text reflects the currently selected provider so the user knows where
 *   credentials come from (OAuth/CLI vs. API key).
 */

import { useMemo } from 'react'
import { Key } from 'lucide-react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  PROVIDERS,
  getProviderDef,
  type ProviderId
} from '../../shared/providers'
import { useOrchestra } from './state/orchestra'
import { useProviders } from './state/providers'
import { useToasts } from '../state/toasts'

interface Props {
  teamId: string
  className?: string
}

// ---------------------------------------------------------------------------
// Local slice: per-team provider binding.
// Persists under `hydra.orchestra.team-providers`. Independent of the provider
// *config* slice (`hydra.orchestra.providers`) because this is purely a
// team → providerId routing map, not credential storage.
// ---------------------------------------------------------------------------

interface Bindings {
  bindings: Record<string /* teamId */, ProviderId>
}

interface TeamProviderBindingState extends Bindings {
  setBinding: (teamId: string, provider: ProviderId) => void
  getBinding: (teamId: string) => ProviderId
}

const DEFAULT_PROVIDER: ProviderId = 'claude-oauth'

export const useTeamProviderBinding = create<TeamProviderBindingState>()(
  persist(
    (set, get) => ({
      bindings: {},
      setBinding: (teamId, provider) => {
        set((s) => ({
          bindings: { ...s.bindings, [teamId]: provider }
        }))
      },
      getBinding: (teamId) => get().bindings[teamId] ?? DEFAULT_PROVIDER
    }),
    {
      name: 'hydra.orchestra.team-providers',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ bindings: s.bindings }) satisfies Bindings,
      // Fresh teams added later shouldn't wipe prior bindings on merge.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Bindings>
        return {
          ...current,
          bindings: { ...current.bindings, ...(p.bindings ?? {}) }
        }
      }
    }
  )
)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Friendly one-liner explaining where the selected provider's credentials
 *  come from. Shown under the <select>. */
function helpTextFor(id: ProviderId): string {
  switch (id) {
    case 'claude-oauth':
      return 'Agents in this team will use the Claude CLI login from ~/.claude.'
    case 'anthropic-api':
      return 'Agents use the Anthropic API key stored under ANTHROPIC_API_KEY.'
    case 'openai':
      return 'Agents route through the OpenAI API (OPENAI_API_KEY).'
    case 'openrouter':
      return 'Agents route through OpenRouter (OPENROUTER_API_KEY).'
    case 'codex-cli':
      return 'Agents shell out to the `codex` CLI installed on the host.'
    default:
      return ''
  }
}

export default function TeamProviderPicker({ teamId, className }: Props) {
  const team = useOrchestra((s) => s.teams.find((t) => t.id === teamId))
  const configs = useProviders((s) => s.configs)
  const binding = useTeamProviderBinding(
    (s) => s.bindings[teamId] ?? DEFAULT_PROVIDER
  )
  const setBinding = useTeamProviderBinding((s) => s.setBinding)

  /** Render the catalog in its native order. Unsupported providers are
   *  included but disabled so the user sees what's coming. */
  const options = useMemo(
    () =>
      PROVIDERS.map((p) => {
        const enabled = configs[p.id]?.enabled ?? false
        const label = p.supported
          ? enabled
            ? p.name
            : `${p.name} (not connected)`
          : `${p.name} (coming soon)`
        return {
          id: p.id,
          label,
          disabled: !p.supported
        }
      }),
    [configs]
  )

  const onChange = (next: ProviderId): void => {
    const def = getProviderDef(next)
    if (!def || !def.supported) return
    setBinding(teamId, next)
    useToasts.getState().push({
      kind: 'success',
      title: `Provider switched to ${def.name}`,
      ...(team ? { body: `Applied to team "${team.name}".` } : {})
    })
  }

  const selectedDef = getProviderDef(binding)
  const help = helpTextFor(binding)

  return (
    <div className={className}>
      <label className="df-label mb-1.5 flex items-center gap-1.5" htmlFor={`team-provider-${teamId}`}>
        <Key size={11} strokeWidth={2} /> provider
      </label>
      <select
        id={`team-provider-${teamId}`}
        value={binding}
        onChange={(e) => onChange(e.target.value as ProviderId)}
        className="w-full rounded-sm border border-border-mid bg-bg-1 px-2 py-1.5 text-sm text-text-1 focus:border-accent-500 focus:outline-none disabled:opacity-40"
        disabled={!team}
        aria-describedby={`team-provider-${teamId}-help`}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <p
        id={`team-provider-${teamId}-help`}
        className="mt-1.5 text-[11px] leading-relaxed text-text-3"
      >
        {help}
        {selectedDef && !configs[selectedDef.id]?.enabled && selectedDef.supported ? (
          <>
            {' '}
            <span className="text-status-warn">
              This provider isn&apos;t connected yet — configure it in Providers.
            </span>
          </>
        ) : null}
      </p>
    </div>
  )
}
