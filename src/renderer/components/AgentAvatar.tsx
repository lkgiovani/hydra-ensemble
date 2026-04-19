import { useEffect, useState } from 'react'
import type { SessionMeta } from '../../shared/types'
import {
  avatarFallbackChain,
  defaultAgentAvatar,
  defaultAgentColor,
  defaultAgentEmoji,
  hexAlpha,
  isAvatarUrl
} from '../lib/agent'

interface Props {
  session: Pick<SessionMeta, 'id' | 'avatar' | 'accentColor'>
  size?: number
  ring?: boolean
}

export default function AgentAvatar({ session, size = 28, ring = true }: Props) {
  const color = session.accentColor || defaultAgentColor(session.id)

  // Priority: explicit avatar (URL or emoji) → deterministic NFT default
  // → emoji fallback if the NFT asset ever fails to load.
  const explicit = session.avatar
  const resolved = explicit || defaultAgentAvatar(session.id)
  const isUrl = isAvatarUrl(resolved)
  const fallbackEmoji = defaultAgentEmoji(session.id)

  const initialChain = isUrl ? avatarFallbackChain(resolved) : []
  const [chainIdx, setChainIdx] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setChainIdx(0)
    setImageFailed(false)
  }, [resolved])

  const showImage = isUrl && !imageFailed && initialChain.length > 0
  const currentSrc = showImage ? initialChain[chainIdx] : null

  return (
    <div
      className="relative flex shrink-0 select-none items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-md)',
        backgroundColor: hexAlpha(color, 0.12),
        boxShadow: ring ? `inset 0 0 0 1px ${hexAlpha(color, 0.45)}` : undefined,
        fontSize: Math.round(size * 0.55),
        lineHeight: 1
      }}
      aria-hidden
    >
      {currentSrc ? (
        <img
          key={currentSrc}
          src={currentSrc}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => {
            const next = chainIdx + 1
            if (next < initialChain.length) {
              setChainIdx(next)
            } else {
              setImageFailed(true)
            }
          }}
          style={{
            width: size,
            height: size,
            objectFit: 'cover',
            display: 'block'
          }}
        />
      ) : (
        <span
          style={{
            filter: `drop-shadow(0 0 6px ${hexAlpha(color, 0.45)})`
          }}
        >
          {explicit && !isAvatarUrl(explicit) ? explicit : fallbackEmoji}
        </span>
      )}
    </div>
  )
}
