import {
  type LucideIcon,
  Beaker,
  Bolt,
  BookOpen,
  Bug,
  Cloud,
  Code,
  Database,
  Eye,
  FileCheck,
  FileSearch,
  Flame,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Globe,
  Hammer,
  Hash,
  Layers,
  Package,
  Play,
  Rocket,
  Send,
  Server,
  Shield,
  Sparkles,
  Tag,
  Terminal,
  Truck,
  Wand2,
  Wrench,
  Zap
} from 'lucide-react'

export const TOOLKIT_ICON_MAP: Record<string, LucideIcon> = {
  play: Play,
  rocket: Rocket,
  hammer: Hammer,
  beaker: Beaker,
  package: Package,
  send: Send,
  truck: Truck,
  bug: Bug,
  shield: Shield,
  zap: Zap,
  flame: Flame,
  sparkles: Sparkles,
  wand: Wand2,
  wrench: Wrench,
  terminal: Terminal,
  code: Code,
  database: Database,
  server: Server,
  globe: Globe,
  cloud: Cloud,
  layers: Layers,
  tag: Tag,
  hash: Hash,
  bolt: Bolt,
  gitBranch: GitBranch,
  gitCommit: GitCommit,
  gitMerge: GitMerge,
  gitPullRequest: GitPullRequest,
  bookOpen: BookOpen,
  fileCheck: FileCheck,
  fileSearch: FileSearch,
  eye: Eye
}

export const TOOLKIT_ICON_NAMES = Object.keys(TOOLKIT_ICON_MAP)

export function ToolkitIcon({
  name,
  size = 14,
  className,
  fallback = 'play'
}: {
  name?: string
  size?: number
  className?: string
  fallback?: string
}) {
  const key = name && TOOLKIT_ICON_MAP[name] ? name : fallback
  const Icon = TOOLKIT_ICON_MAP[key] ?? Play
  return <Icon size={size} strokeWidth={1.75} className={className} />
}

const NAME_HEURISTIC: Array<[RegExp, string]> = [
  [/test|spec/i, 'beaker'],
  [/build|compile/i, 'hammer'],
  [/lint|format/i, 'wand'],
  [/deploy|ship|release/i, 'rocket'],
  [/run|start|dev|serve/i, 'play'],
  [/install|deps|pkg/i, 'package'],
  [/commit/i, 'gitCommit'],
  [/push|publish/i, 'send'],
  [/pull|pr|merge/i, 'gitPullRequest'],
  [/branch|worktree/i, 'gitBranch'],
  [/db|migrate|seed/i, 'database'],
  [/scan|audit|check/i, 'shield'],
  [/log|inspect|debug/i, 'bug'],
  [/docs|read/i, 'bookOpen']
]

/** Pick a sensible default icon when the user hasn't chosen one. */
export function guessIconForLabel(label: string): string {
  for (const [re, icon] of NAME_HEURISTIC) {
    if (re.test(label)) return icon
  }
  return 'play'
}
