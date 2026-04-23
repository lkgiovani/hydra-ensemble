import { useMemo } from 'react'
import { Sparkles, ArrowDown } from 'lucide-react'

export interface Suggestion {
  id: string
  label: string
  prompt: string
  tag?: string
}

interface Props {
  agentName?: string
  accentColor?: string
  onSuggestion: (prompt: string) => void
  suggestions?: Suggestion[]
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  {
    id: 'review-pr',
    label: 'Review this PR',
    prompt: 'Review the current changes. Focus on correctness, tests, and edge cases.',
    tag: 'review',
  },
  {
    id: 'run-tests',
    label: 'Run tests',
    prompt: 'Run the test suite and summarise any failures.',
    tag: 'test',
  },
  {
    id: 'explain-codebase',
    label: 'Explain this codebase',
    prompt: 'Give me a one-page tour of this codebase. Start with the entry point.',
    tag: 'explain',
  },
  {
    id: 'refactor-file',
    label: 'Refactor this file',
    prompt: 'Refactor the focused file for readability and extract helpers where it helps.',
    tag: 'refactor',
  },
  {
    id: 'write-tests',
    label: 'Write tests',
    prompt: 'Add unit tests for uncovered branches in the last changed file.',
    tag: 'test',
  },
  {
    id: 'debug-failure',
    label: 'Debug a failure',
    prompt: 'The failure output is:\n\n<paste here>\n\nInvestigate and propose a fix.',
    tag: 'debug',
  },
  {
    id: 'write-docs',
    label: 'Write docs',
    prompt: 'Write a concise README section for this module explaining how to use it.',
    tag: 'docs',
  },
  {
    id: 'security-review',
    label: 'Security review',
    prompt: 'Scan the diff for common security issues (injection, unsafe env, secrets).',
    tag: 'security',
  },
]

export default function ChatEmptyState({
  agentName,
  accentColor,
  onSuggestion,
  suggestions,
}: Props) {
  const items = suggestions ?? DEFAULT_SUGGESTIONS
  const name = agentName ?? 'Claude'
  const initial = useMemo(() => name.trim().charAt(0).toUpperCase() || 'C', [name])
  const avatarStyle = accentColor ? { backgroundColor: accentColor } : undefined

  return (
    <div
      className="flex h-full w-full items-center justify-center px-6 py-10"
      style={{ animation: 'chatEmptyFadeIn 260ms ease-out both' }}
    >
      <style>{`
        @keyframes chatEmptyFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex w-full max-w-[480px] flex-col items-center gap-6">
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-lg"
          style={avatarStyle ?? { backgroundColor: 'var(--accent-500, #6366f1)' }}
          aria-hidden="true"
        >
          <span>{initial}</span>
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg-2 border border-border-soft">
            <Sparkles className="h-3 w-3 text-accent-400" />
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-lg font-semibold text-text-1">
            Say hi to {name}
          </h2>
          <p className="text-[12px] text-text-2">
            Pick a starter below, or write your own prompt.
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2">
          {items.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSuggestion(s.prompt)}
              className="group flex items-center justify-between gap-2 rounded-full border border-border-soft bg-bg-2 px-3 py-1.5 text-[11px] text-text-2 hover:border-accent-500 hover:text-accent-400 transition"
              style={{
                animation: `chatEmptyFadeIn 320ms ease-out ${80 + idx * 30}ms both`,
              }}
              title={s.prompt}
            >
              <span className="truncate text-left">{s.label}</span>
              {s.tag && (
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-text-3 opacity-70 group-hover:opacity-100">
                  {s.tag}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-text-3">
          <span>Or just start typing below</span>
          <ArrowDown className="h-3 w-3" />
        </div>
      </div>
    </div>
  )
}
