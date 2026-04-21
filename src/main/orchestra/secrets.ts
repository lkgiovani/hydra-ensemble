/**
 * Secret storage for the Anthropic API key.
 *
 * Primary path: OS keychain via `keytar`.
 * Fallback: Electron `safeStorage` encrypting to a 0600 file in
 * `~/.hydra-ensemble/secrets/anthropic.enc`.
 *
 * Tests inject doubles via {@link __setSecretsDeps}; production paths
 * import the real `keytar` / `electron` / `fs` modules lazily so this
 * file is importable in non-Electron contexts (vitest).
 *
 * Never log the key. Use {@link redactedKey} when a hint is required.
 */
import { AuthenticationError } from '@anthropic-ai/sdk'
import type Anthropic from '@anthropic-ai/sdk'

const SERVICE_NAME = 'hydra-ensemble'
const ACCOUNT_NAME = 'anthropic-api-key'
const PING_MODEL = 'claude-haiku-4-5-20251001'

export type StorageKind = 'keychain' | 'safeStorage'

type KeytarLike = {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

type SafeStorageLike = {
  isEncryptionAvailable(): boolean
  encryptString(plaintext: string): Buffer
  decryptString(buf: Buffer): string
}

type FsLike = {
  readFileSync(p: string): Buffer
  writeFileSync(p: string, data: Buffer): void
  mkdirSync(p: string, opts: { recursive: true; mode?: number }): void
  chmodSync(p: string, mode: number): void
  existsSync(p: string): boolean
  unlinkSync(p: string): void
}

type PathLike = {
  join(...segs: string[]): string
  dirname(p: string): string
}

type AnthropicCtor = new (opts: { apiKey: string }) => Pick<Anthropic, 'messages'>

type Deps = {
  keytar: KeytarLike | null
  safeStorage: SafeStorageLike | null
  anthropic: AnthropicCtor | null
  fs: FsLike | null
  path: PathLike | null
  homedir: () => string
}

// Lazy loaders so importing this module does not pull in `electron`
// or native modules (`keytar`) under vitest.
function defaultDeps(): Deps {
  return {
    keytar: loadKeytar(),
    safeStorage: loadSafeStorage(),
    anthropic: loadAnthropic(),
    fs: loadFs(),
    path: loadPath(),
    homedir: () => loadOs().homedir()
  }
}

function loadKeytar(): KeytarLike | null {
  try { return require('keytar') as KeytarLike } catch { return null }
}
function loadSafeStorage(): SafeStorageLike | null {
  try { return (require('electron') as { safeStorage: SafeStorageLike }).safeStorage } catch { return null }
}
function loadAnthropic(): AnthropicCtor | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@anthropic-ai/sdk')
    return (mod.default ?? mod.Anthropic) as AnthropicCtor
  } catch { return null }
}
function loadFs(): FsLike | null {
  try { return require('node:fs') as FsLike } catch { return null }
}
function loadPath(): PathLike | null {
  try { return require('node:path') as PathLike } catch { return null }
}
function loadOs(): { homedir: () => string } {
  return require('node:os') as { homedir: () => string }
}

let deps: Deps = defaultDeps()

/** Test-only hook. Pass `{}` to reset to real modules. */
export function __setSecretsDeps(overrides: Partial<Deps> & { reset?: boolean }): void {
  if (overrides.reset) { deps = defaultDeps(); return }
  deps = { ...deps, ...overrides }
}

function fallbackPath(): string {
  const p = deps.path
  if (!p) throw new Error('path module unavailable')
  return p.join(deps.homedir(), '.hydra-ensemble', 'secrets', 'anthropic.enc')
}

/** Redact a key to `sk-ant-****<last 4>` for log lines. */
export function redactedKey(key: string): string {
  if (!key) return 'sk-ant-****'
  const tail = key.slice(-4)
  return `sk-ant-****${tail}`
}

export async function setApiKey(
  plaintext: string,
  prefer: StorageKind
): Promise<StorageKind> {
  if (!plaintext || plaintext.length === 0) throw new Error('empty key')

  if (prefer === 'keychain' && deps.keytar) {
    try {
      await deps.keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, plaintext)
      return 'keychain'
    } catch {
      // fall through to safeStorage
    }
  }
  return writeSafeStorage(plaintext)
}

function writeSafeStorage(plaintext: string): StorageKind {
  const { safeStorage, fs, path } = deps
  if (!safeStorage || !fs || !path) throw new Error('safeStorage unavailable')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage unavailable')
  const file = fallbackPath()
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  try { fs.chmodSync(dir, 0o700) } catch { /* best-effort on platforms without chmod */ }
  const enc = safeStorage.encryptString(plaintext)
  fs.writeFileSync(file, enc)
  try { fs.chmodSync(file, 0o600) } catch { /* ditto */ }
  return 'safeStorage'
}

export async function getApiKey(): Promise<string | null> {
  if (deps.keytar) {
    try {
      const v = await deps.keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
      if (v) return v
    } catch { /* fall through */ }
  }
  const { safeStorage, fs } = deps
  if (safeStorage && fs) {
    try {
      const file = fallbackPath()
      if (fs.existsSync(file) && safeStorage.isEncryptionAvailable()) {
        const buf = fs.readFileSync(file)
        const plain = safeStorage.decryptString(buf)
        if (plain) return plain
      }
    } catch { /* fall through */ }
  }
  return null
}

export async function clearApiKey(): Promise<void> {
  if (deps.keytar) {
    try { await deps.keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME) } catch { /* ignore */ }
  }
  const { fs } = deps
  if (fs) {
    try {
      const file = fallbackPath()
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } catch { /* ignore */ }
  }
}

export async function testApiKey(
  plaintext?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = plaintext ?? (await getApiKey())
  if (!key) return { ok: false, error: 'no key' }
  const Ctor = deps.anthropic
  if (!Ctor) return { ok: false, error: 'anthropic sdk unavailable' }
  try {
    const client = new Ctor({ apiKey: key })
    await client.messages.create({
      model: PING_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    })
    return { ok: true }
  } catch (err: unknown) {
    if (isAuthError(err)) return { ok: false, error: 'invalid key' }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `network: ${msg}` }
  }
}

function isAuthError(err: unknown): boolean {
  if (err instanceof AuthenticationError) return true
  if (typeof err === 'object' && err !== null) {
    const status = (err as { status?: number }).status
    if (status === 401) return true
  }
  return false
}
