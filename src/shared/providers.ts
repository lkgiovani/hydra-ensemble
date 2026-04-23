/**
 * Multi-provider registry for Orchestra.
 *
 * Orchestra agents can dispatch through different model providers; this
 * module is the single source of truth for which providers exist, how they
 * authenticate, and whether the runner actually understands how to route
 * calls to them today.
 *
 * `PROVIDERS` lives in /shared so both the renderer (ProvidersDialog) and
 * any future main-side runner can import the same list — diverging the two
 * would mean a user can "connect" a provider the runner silently ignores.
 *
 * Plaintext key material only exists in the modal and in the persisted
 * renderer slice while the user is configuring it. The runner is expected
 * to read via the preload/main IPC using the provider id rather than
 * consuming `ProviderConfig.value` directly from shared storage.
 */

export type ProviderId =
  | 'claude-oauth'
  | 'anthropic-api'
  | 'openai'
  | 'openrouter'
  | 'codex-cli'

export type AuthKind = 'oauth' | 'apiKey' | 'cli'

export interface ProviderDef {
  id: ProviderId
  name: string
  description: string
  authKind: AuthKind
  /** Env var the runner will set (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY).
   *  Undefined for OAuth/CLI providers that read their own credentials. */
  envVar?: string
  /** Optional validator — used by the modal to warn about obvious typos
   *  before round-tripping to the provider. */
  keyFormat?: RegExp
  docsUrl: string
  /** Whether Orchestra currently supports actually dispatching via this
   *  provider. UI shows disabled ("coming soon") for `false`. */
  supported: boolean
}

/** The full provider catalog. Order here is the order the modal renders. */
export const PROVIDERS: readonly ProviderDef[] = [
  {
    id: 'claude-oauth',
    name: 'Claude Code (OAuth)',
    description:
      'Reuses your existing `claude` CLI login. No key to manage — Orchestra invokes the CLI on the host.',
    authKind: 'oauth',
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
    supported: true
  },
  {
    id: 'anthropic-api',
    name: 'Anthropic API',
    description:
      'Headless Anthropic API key for Orchestra agents. Separate from the `claude` CLI OAuth session.',
    authKind: 'apiKey',
    envVar: 'ANTHROPIC_API_KEY',
    keyFormat: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    docsUrl: 'https://console.anthropic.com/settings/keys',
    supported: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description:
      'GPT-4o / o-series models via the OpenAI API. Routing support lands in an upcoming release.',
    authKind: 'apiKey',
    envVar: 'OPENAI_API_KEY',
    keyFormat: /^sk-[A-Za-z0-9_-]{20,}$/,
    docsUrl: 'https://platform.openai.com/api-keys',
    supported: false
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description:
      'Unified gateway for Claude, GPT, Gemini, Llama, and more. Bring-your-own OpenRouter key.',
    authKind: 'apiKey',
    envVar: 'OPENROUTER_API_KEY',
    keyFormat: /^sk-or-[A-Za-z0-9_-]{20,}$/,
    docsUrl: 'https://openrouter.ai/keys',
    supported: false
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    description:
      'Routes through the `codex` CLI tool when installed on the host (similar model to Claude OAuth).',
    authKind: 'cli',
    docsUrl: 'https://github.com/openai/codex',
    supported: false
  }
] as const

/** Stored config entry per provider. `value` is the key/token string;
 *  never leaves main+preload in plaintext beyond the modal. */
export interface ProviderConfig {
  id: ProviderId
  enabled: boolean
  /** Undefined for OAuth / CLI; string for apiKey providers. */
  value?: string
  /** Which team(s) are allowed to use this provider (empty = all). */
  scope?: string[]
}

/** Default config for a provider — disabled, no value, no scope restriction.
 *  Used by the state slice when seeding a fresh store. */
export function defaultProviderConfig(id: ProviderId): ProviderConfig {
  return { id, enabled: id === 'claude-oauth', value: undefined, scope: [] }
}

/** Lookup helper used by both the modal and the state slice. */
export function getProviderDef(id: ProviderId): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id)
}
