// Deterministic defaults for agent visual identity.
// Each session gets a stable emoji + accent color derived from its id,
// so re-renders never reshuffle the look.

export const AGENT_EMOJIS = [
  '🦊', '🦁', '🐺', '🦅', '🦉', '🦋', '🦄', '🐉',
  '🦖', '🦈', '🦦', '🦔', '🦝', '🐳', '🤖', '👾',
  '🛸', '⚡', '🔥', '✨', '💫', '🌙', '🎯', '🎲',
  '🧩', '🎭', '🎨', '🎪', '🌵', '🍀', '🍄', '🪐',
  '🪲', '🌶️', '🪻', '🐚', '🪨', '🗿', '🪬', '🎴'
] as const

export const AGENT_COLORS = [
  '#ff6b4d', '#fbbf24', '#2ecc71', '#4ea5ff',
  '#c084fc', '#ec4899', '#14b8a6', '#f97316',
  '#a78bfa', '#f43f5e', '#84cc16', '#06b6d4',
  '#eab308', '#8b5cf6', '#10b981', '#3b82f6'
] as const

/**
 * NFT-style avatar gallery — 40 pixel-art characters bundled locally so the
 * app works 100% offline. Sources were generated once from dicebear's
 * `pixel-art` style (CC0) and saved into `src/renderer/assets/avatars/`.
 *
 * Vite's import.meta.glob turns every `.svg` file in the dir into a URL
 * relative to the final bundle, so paths survive dev (HTTP) and packaged
 * builds (file://) without us having to track them manually.
 */
const AVATAR_MODULES = import.meta.glob('../assets/avatars/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

// Sort by path for a stable iteration order — picker grid shouldn't reshuffle
// between dev and prod builds.
export const NFT_AVATAR_URLS: readonly string[] = Object.keys(AVATAR_MODULES)
  .sort()
  .map((k) => AVATAR_MODULES[k])
  .filter((v): v is string => typeof v === 'string')

/** Backwards-compat alias used by the picker in AgentEditDialog. */
export const NFT_APE_URLS = NFT_AVATAR_URLS

/** Pick a deterministic NFT URL for a session id. */
export function defaultAgentAvatar(seed: string): string {
  if (NFT_AVATAR_URLS.length === 0) return ''
  const idx = hashStr(seed + '-nft') % NFT_AVATAR_URLS.length
  return NFT_AVATAR_URLS[idx] ?? ''
}

/**
 * Fallback chain for an avatar URL. The local bundle is a single source,
 * kept as a function so AgentAvatar's call sites don't need to change.
 */
export function avatarFallbackChain(url: string): string[] {
  return [url]
}

/** @deprecated kept for older imports — same as avatarFallbackChain. */
export const apeGatewayChain = avatarFallbackChain

/** Detect whether an avatar string is an image resource vs an emoji.
 *  Treats absolute URLs, data URIs, and any path-like string (contains '/'
 *  or a common image extension) as image references. Emoji glyphs are
 *  never "path-like", so this cleanly partitions the two kinds. */
export function isAvatarUrl(avatar: string | undefined): boolean {
  if (!avatar) return false
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return true
  if (avatar.startsWith('data:') || avatar.startsWith('blob:')) return true
  if (avatar.includes('/')) return true
  return /\.(svg|png|jpe?g|webp|gif)$/i.test(avatar)
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function defaultAgentEmoji(seed: string): string {
  const idx = hashStr(seed) % AGENT_EMOJIS.length
  return AGENT_EMOJIS[idx] ?? '🤖'
}

export function defaultAgentColor(seed: string): string {
  const idx = hashStr(seed + '-color') % AGENT_COLORS.length
  return AGENT_COLORS[idx] ?? '#ff6b4d'
}

/** Lighten/dim a hex color for ring/background use. */
export function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}
