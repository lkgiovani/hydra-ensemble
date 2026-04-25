import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  JsonlWatcher,
  encodePath,
  extractText,
  shortModelName
} from '../jsonl-watcher'
import type { JsonlUpdate } from '../../../shared/types'

const cleanupPaths: string[] = []

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const p = cleanupPaths.pop()
    if (!p) continue
    await rm(p, { recursive: true, force: true })
  }
})

function tmpScratch(): string {
  const path = join(tmpdir(), `jsonl-watcher-${randomUUID()}`)
  cleanupPaths.push(path)
  return path
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// shortModelName
// ---------------------------------------------------------------------------

describe('shortModelName', () => {
  it('detects opus', () => {
    expect(shortModelName('claude-opus-4-6-20250514')).toBe('opus')
  })

  it('detects sonnet', () => {
    expect(shortModelName('claude-sonnet-4-20250514')).toBe('sonnet')
  })

  it('detects haiku', () => {
    expect(shortModelName('claude-haiku-3-5-20250514')).toBe('haiku')
  })

  it('returns the lowercased identifier when unknown', () => {
    expect(shortModelName('some-other-model')).toBe('some-other-model')
  })

  it('is case insensitive', () => {
    expect(shortModelName('Claude-OPUS-4')).toBe('opus')
  })

  it('is exposed as a static on JsonlWatcher', () => {
    expect(JsonlWatcher.shortModelName('Claude-OPUS-4')).toBe('opus')
  })
})

// ---------------------------------------------------------------------------
// encodePath
// ---------------------------------------------------------------------------

describe('encodePath', () => {
  it('encodes a basic path', () => {
    expect(encodePath('/Users/foo/project')).toBe('-Users-foo-project')
  })

  it('encodes a deep path', () => {
    expect(encodePath('/Users/jwatters/code/hydra-ensemble')).toBe('-Users-jwatters-code-hydra-ensemble')
  })

  it('is exposed as a static on JsonlWatcher', () => {
    expect(JsonlWatcher.encodePath('/a/b')).toBe('-a-b')
  })
})

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------

describe('extractText', () => {
  it('returns plain strings as-is', () => {
    expect(extractText('hello')).toBe('hello')
  })

  it('trims whitespace from plain strings', () => {
    expect(extractText('  hello\n')).toBe('hello')
  })

  it('joins text blocks from an array with newlines', () => {
    const content = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' }
    ]
    expect(extractText(content)).toBe('first\nsecond')
  })

  it('skips non-text blocks', () => {
    const content = [
      { type: 'tool_use', id: 'abc', name: 'Read' },
      { type: 'text', text: 'only this' },
      { type: 'tool_result', tool_use_id: 'abc' }
    ]
    expect(extractText(content)).toBe('only this')
  })

  it('returns null for an empty array', () => {
    expect(extractText([])).toBeNull()
  })

  it('returns null when only tool blocks are present', () => {
    const content = [{ type: 'tool_use', id: 'abc', name: 'Bash' }]
    expect(extractText(content)).toBeNull()
  })

  it('returns null for unsupported types', () => {
    expect(extractText(42)).toBeNull()
    expect(extractText(null)).toBeNull()
    expect(extractText(undefined)).toBeNull()
  })

  it('is exposed as a static on JsonlWatcher', () => {
    expect(JsonlWatcher.extractText('hi')).toBe('hi')
  })
})

// ---------------------------------------------------------------------------
// Integration: tail a real file in a tmp dir
// ---------------------------------------------------------------------------

interface FakeAssistantLine {
  type: 'assistant'
  message: {
    model?: string
    content?: unknown
    usage: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
}

function makeAssistantLine(
  partial: Partial<FakeAssistantLine['message']> & {
    usage: FakeAssistantLine['message']['usage']
  }
): string {
  const obj: FakeAssistantLine = {
    type: 'assistant',
    message: {
      model: partial.model,
      content: partial.content,
      usage: partial.usage
    }
  }
  return JSON.stringify(obj) + '\n'
}

async function waitFor<T>(
  fn: () => T | undefined | null,
  timeoutMs = 4000
): Promise<T> {
  const start = Date.now()
  // Poll every 25ms until the predicate returns a truthy value or we time out.
  while (Date.now() - start < timeoutMs) {
    const value = fn()
    if (value !== undefined && value !== null) return value
    await delay(25)
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`)
}

describe('JsonlWatcher integration', () => {
  it('accumulates cost, tokens, and model across assistant lines', async () => {
    const root = tmpScratch()
    const cwd = '/Users/test/project'
    const projectDir = join(root, 'projects', encodePath(cwd))
    await mkdir(projectDir, { recursive: true })

    const sessionFile = join(projectDir, `${randomUUID()}.jsonl`)
    // Pre-seed one line so the watcher resolves on first scan instead of
    // entering the 3s resolve-poll loop.
    const line1 = makeAssistantLine({
      model: 'claude-sonnet-4-20250514',
      content: [{ type: 'text', text: 'hello world' }],
      usage: { input_tokens: 1000, output_tokens: 500 }
    })
    await writeFile(sessionFile, line1)

    const updates: JsonlUpdate[] = []
    const watcher = new JsonlWatcher({
      sessionId: 'sess-1',
      claudeConfigDir: root,
      cwd,
      onUpdate: (u) => updates.push(u)
    })

    try {
      const first = await waitFor(() => updates.at(-1))
      expect(first.sessionId).toBe('sess-1')
      // The watcher now preserves the full raw model id so the renderer
      // can surface version + variant info (formatModel handles the
      // friendly display); pricing still works because shortModelName()
      // is called on the fly at the per-line cost-lookup site.
      expect(first.model).toBe('claude-sonnet-4-20250514')
      expect(first.tokensIn).toBe(1000)
      expect(first.tokensOut).toBe(500)
      // sonnet: input 3/M, output 15/M => 1000*3/1e6 + 500*15/1e6 = 0.003 + 0.0075
      expect(first.cost).toBeCloseTo(0.0105, 6)
      expect(first.latestAssistantText).toBe('hello world')
      expect(first.latestAssistantAt).toBeTypeOf('string')

      // Append a second line (now using opus + cache tokens).
      const line2 = makeAssistantLine({
        model: 'claude-opus-4-6-20250514',
        content: [
          { type: 'tool_use', id: 'x', name: 'Read' },
          { type: 'text', text: 'second response' }
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 500
        }
      })
      const before = updates.length
      await appendFile(sessionFile, line2)

      const second = await waitFor(() =>
        updates.length > before ? updates.at(-1) : undefined
      )
      expect(second.model).toBe('claude-opus-4-6-20250514')
      // Tokens accumulate: 1000 + 100 + 1000 + 500 = 2600 in; 500 + 200 = 700 out
      expect(second.tokensIn).toBe(2600)
      expect(second.tokensOut).toBe(700)
      // Opus: input 15/M, output 75/M, cacheCreate 18.75/M, cacheRead 1.5/M
      // line2 cost = 100*15/1e6 + 1000*18.75/1e6 + 500*1.5/1e6 + 200*75/1e6
      //            = 0.0015 + 0.01875 + 0.00075 + 0.015 = 0.036
      // total = 0.0105 + 0.036 = 0.0465
      expect(second.cost).toBeCloseTo(0.0465, 6)
      expect(second.latestAssistantText).toBe('second response')
    } finally {
      watcher.stop()
    }
  })

  it('skips non-assistant lines and malformed JSON', async () => {
    const root = tmpScratch()
    const cwd = '/Users/test/skip'
    const projectDir = join(root, 'projects', encodePath(cwd))
    await mkdir(projectDir, { recursive: true })

    const sessionFile = join(projectDir, `${randomUUID()}.jsonl`)
    const userLine = JSON.stringify({ type: 'user', message: { content: 'hi' } }) + '\n'
    const garbage = 'not json at all\n'
    const assistant = makeAssistantLine({
      model: 'claude-haiku-3-5-20250514',
      content: 'just text',
      usage: { input_tokens: 10, output_tokens: 20 }
    })
    await writeFile(sessionFile, userLine + garbage + assistant)

    const updates: JsonlUpdate[] = []
    const watcher = new JsonlWatcher({
      sessionId: 'sess-2',
      claudeConfigDir: root,
      cwd,
      onUpdate: (u) => updates.push(u)
    })

    try {
      const update = await waitFor(() => updates.at(-1))
      expect(updates).toHaveLength(1) // only the assistant line triggered an emit
      expect(update.model).toBe('claude-haiku-3-5-20250514')
      expect(update.tokensIn).toBe(10)
      expect(update.tokensOut).toBe(20)
      // Haiku: input 0.25/M, output 1.25/M => 10*0.25/1e6 + 20*1.25/1e6
      //                                    = 0.0000025 + 0.000025 = 0.0000275
      // Cost is rounded to 6 decimals before emit, so accept ~0.000028.
      expect(update.cost).toBeCloseTo(0.0000275, 5)
      expect(update.latestAssistantText).toBe('just text')
    } finally {
      watcher.stop()
    }
  })

  it('waits for the session directory to appear before tailing', async () => {
    const root = tmpScratch()
    const cwd = '/Users/test/late'
    const projectDir = join(root, 'projects', encodePath(cwd))

    const updates: JsonlUpdate[] = []
    const watcher = new JsonlWatcher({
      sessionId: 'sess-3',
      claudeConfigDir: root,
      cwd,
      onUpdate: (u) => updates.push(u)
    })

    try {
      // Nothing exists yet — no updates should fire.
      await delay(150)
      expect(updates).toHaveLength(0)

      // Create the dir and a file; the resolve-poll loop will pick it up
      // within ~3s.
      await mkdir(projectDir, { recursive: true })
      const sessionFile = join(projectDir, `${randomUUID()}.jsonl`)
      await writeFile(
        sessionFile,
        makeAssistantLine({
          model: 'claude-sonnet-4',
          usage: { input_tokens: 0, output_tokens: 1 }
        })
      )

      const update = await waitFor(() => updates.at(-1), 6000)
      expect(update.model).toBe('claude-sonnet-4')
      expect(update.tokensOut).toBe(1)
    } finally {
      watcher.stop()
    }
  }, 10_000)

  it('stops cleanly and emits no further updates', async () => {
    const root = tmpScratch()
    const cwd = '/Users/test/stop'
    const projectDir = join(root, 'projects', encodePath(cwd))
    await mkdir(projectDir, { recursive: true })

    const sessionFile = join(projectDir, `${randomUUID()}.jsonl`)
    await writeFile(
      sessionFile,
      makeAssistantLine({
        model: 'claude-sonnet-4',
        usage: { input_tokens: 1, output_tokens: 1 }
      })
    )

    const updates: JsonlUpdate[] = []
    const watcher = new JsonlWatcher({
      sessionId: 'sess-4',
      claudeConfigDir: root,
      cwd,
      onUpdate: (u) => updates.push(u)
    })

    try {
      await waitFor(() => updates.at(-1))
      const beforeStop = updates.length
      watcher.stop()

      // Append more after stopping; no callbacks should fire.
      await appendFile(
        sessionFile,
        makeAssistantLine({
          model: 'claude-sonnet-4',
          usage: { input_tokens: 100, output_tokens: 100 }
        })
      )
      await delay(200)
      expect(updates).toHaveLength(beforeStop)
    } finally {
      watcher.stop()
    }
  })
})
