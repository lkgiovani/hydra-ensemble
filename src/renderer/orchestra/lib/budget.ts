/**
 * Budget approximation helpers for Orchestra.
 *
 * The MessageLog doesn't yet carry real token usage, so we approximate
 * via a char-count heuristic (~4 chars ≈ 1 token) and a coarse per-model
 * price table (cents per million tokens). Good enough for the MVP's
 * "ballpark" meter; swap for real accounting once provider usage is
 * wired through.
 */

import type { MessageLog } from '../../../shared/orchestra'

/** Rule of thumb across English + typical code. One token ≈ four chars. */
export const TOKENS_PER_CHAR = 0.25

export interface ModelPricing {
  inputCentsPerMTok: number
  outputCentsPerMTok: number
}

/** Rounded Anthropic list prices, cents per million tokens. MVP only —
 *  not meant for billing. Keys are the short family names we use in
 *  Team.defaultModel / Agent.model.
 *
 *  Lookup in {@link estimateCostCents} is case-insensitive and matches by
 *  substring so 'claude-sonnet-4-6' / 'sonnet-4' both resolve to 'sonnet'. */
export const PRICING: Record<string, ModelPricing> = {
  opus: { inputCentsPerMTok: 1500, outputCentsPerMTok: 7500 },
  sonnet: { inputCentsPerMTok: 300, outputCentsPerMTok: 1500 },
  haiku: { inputCentsPerMTok: 80, outputCentsPerMTok: 400 }
}

const FAMILY_ORDER = ['opus', 'sonnet', 'haiku'] as const

/** Resolve a free-form model string to a pricing entry. Falls back to
 *  sonnet when nothing matches, keeping the meter non-zero for unknown
 *  models instead of silently under-counting. */
const SONNET_FALLBACK: ModelPricing = { inputCentsPerMTok: 300, outputCentsPerMTok: 1500 }

function resolvePricing(model: string | undefined): ModelPricing {
  const needle = (model ?? '').toLowerCase()
  for (const family of FAMILY_ORDER) {
    if (needle.includes(family)) {
      const entry = PRICING[family]
      if (entry) return entry
    }
  }
  return PRICING.sonnet ?? SONNET_FALLBACK
}

/** Approximate token count from a string. Returns 0 for empty input. */
export function approxTokens(text: string): number {
  if (!text) return 0
  // Math.ceil so even a 1-char string counts as 1 token.
  return Math.ceil(text.length * TOKENS_PER_CHAR)
}

/** Cost in cents for `inputTokens` + `outputTokens` at the model's rate.
 *  Returned as a float — callers format via {@link formatCents}. */
export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = resolvePricing(model)
  const inputCost = (inputTokens / 1_000_000) * price.inputCentsPerMTok
  const outputCost = (outputTokens / 1_000_000) * price.outputCentsPerMTok
  return inputCost + outputCost
}

/** Fold a MessageLog slice into tokens + cents. Treats agent `output`
 *  entries as OUTPUT tokens and everything else (delegation / status /
 *  approval_request / error) as INPUT tokens — those are prompts or
 *  metadata the agent has to consume.
 *
 *  `model` defaults to 'sonnet' when caller passes falsy (matches the
 *  fallback in {@link resolvePricing}). */
export function sumMessages(
  messages: MessageLog[],
  model: string
): { inputTokens: number; outputTokens: number; cents: number } {
  let inputTokens = 0
  let outputTokens = 0
  for (const m of messages) {
    const tokens = approxTokens(m.content)
    if (m.kind === 'output') {
      outputTokens += tokens
    } else {
      // delegation | status | approval_request | error
      inputTokens += tokens
    }
  }
  const cents = estimateCostCents(
    model || 'sonnet',
    inputTokens,
    outputTokens
  )
  return { inputTokens, outputTokens, cents }
}

/** Currency string for a float cent value. Shows `<$0.01` for tiny
 *  non-zero costs so users know the meter's alive, and drops the trailing
 *  zeros for whole-dollar-ish values for compactness. */
export function formatCents(cents: number): string {
  if (cents <= 0) return '$0.00'
  if (cents < 1) return '<$0.01'
  const dollars = cents / 100
  return `$${dollars.toFixed(2)}`
}

/** Compact human token count. 342 / 1.2k / 12.4M. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1_000) return `${Math.round(n)}`
  if (n < 1_000_000) {
    const k = n / 1_000
    // Drop the decimal above 100k to keep things tight.
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`
  }
  const m = n / 1_000_000
  return m >= 100 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`
}
