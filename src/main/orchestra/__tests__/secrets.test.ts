import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __setSecretsDeps,
  clearApiKey,
  getApiKey,
  redactedKey,
  setApiKey,
  testApiKey
} from '../secrets'

/**
 * Everything is exercised through injected doubles. The real `keytar` /
 * `electron.safeStorage` / `@anthropic-ai/sdk` are never reached, so these
 * tests run anywhere vitest runs.
 */

type FakeFs = {
  store: Map<string, Buffer>
  readFileSync: (p: string) => Buffer
  writeFileSync: (p: string, d: Buffer) => void
  mkdirSync: (p: string, o: { recursive: true; mode?: number }) => void
  chmodSync: (p: string, m: number) => void
  existsSync: (p: string) => boolean
  unlinkSync: (p: string) => void
  chmodCalls: Array<{ path: string; mode: number }>
}

function makeFakeFs(): FakeFs {
  const store = new Map<string, Buffer>()
  const chmodCalls: Array<{ path: string; mode: number }> = []
  return {
    store,
    chmodCalls,
    readFileSync: (p) => {
      const b = store.get(p)
      if (!b) throw new Error(`ENOENT: ${p}`)
      return b
    },
    writeFileSync: (p, d) => void store.set(p, d),
    mkdirSync: () => { /* no-op */ },
    chmodSync: (p, m) => void chmodCalls.push({ path: p, mode: m }),
    existsSync: (p) => store.has(p),
    unlinkSync: (p) => void store.delete(p)
  }
}

const fakePath = {
  join: (...s: string[]) => s.join('/'),
  dirname: (p: string) => p.slice(0, p.lastIndexOf('/'))
}

const HOME = '/home/unit'

function makeKeytar() {
  const kv = new Map<string, string>()
  return {
    store: kv,
    getPassword: vi.fn(async (s: string, a: string) => kv.get(`${s}:${a}`) ?? null),
    setPassword: vi.fn(async (s: string, a: string, p: string) => void kv.set(`${s}:${a}`, p)),
    deletePassword: vi.fn(async (s: string, a: string) => kv.delete(`${s}:${a}`))
  }
}

function makeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b: Buffer) => {
      const t = b.toString('utf8')
      if (!t.startsWith('enc:')) throw new Error('bad cipher')
      return t.slice(4)
    }
  }
}

afterEach(() => { __setSecretsDeps({ reset: true }) })

describe('setApiKey', () => {
  it('writes to keychain on the happy path', async () => {
    const keytar = makeKeytar()
    __setSecretsDeps({
      keytar, safeStorage: makeSafeStorage(), fs: makeFakeFs(),
      path: fakePath, homedir: () => HOME
    })

    const used = await setApiKey('sk-ant-abcd1234', 'keychain')
    expect(used).toBe('keychain')
    expect(keytar.setPassword).toHaveBeenCalledWith(
      'hydra-ensemble', 'anthropic-api-key', 'sk-ant-abcd1234'
    )
  })

  it('falls back to safeStorage when keytar throws', async () => {
    const keytar = makeKeytar()
    keytar.setPassword.mockRejectedValueOnce(new Error('keychain locked'))
    const fs = makeFakeFs()
    __setSecretsDeps({
      keytar, safeStorage: makeSafeStorage(), fs,
      path: fakePath, homedir: () => HOME
    })

    const used = await setApiKey('sk-ant-zzzz9999', 'keychain')
    expect(used).toBe('safeStorage')
    const expectedFile = `${HOME}/.hydra-ensemble/secrets/anthropic.enc`
    expect(fs.store.has(expectedFile)).toBe(true)
    expect(fs.chmodCalls).toContainEqual({ path: expectedFile, mode: 0o600 })
    expect(fs.chmodCalls).toContainEqual({
      path: `${HOME}/.hydra-ensemble/secrets`, mode: 0o700
    })
  })
})

describe('getApiKey', () => {
  it('returns the value from the keychain first', async () => {
    const keytar = makeKeytar()
    keytar.store.set('hydra-ensemble:anthropic-api-key', 'sk-ant-key-from-chain')
    __setSecretsDeps({
      keytar, safeStorage: makeSafeStorage(), fs: makeFakeFs(),
      path: fakePath, homedir: () => HOME
    })
    expect(await getApiKey()).toBe('sk-ant-key-from-chain')
  })

  it('falls back to safeStorage when keychain is empty', async () => {
    const fs = makeFakeFs()
    const file = `${HOME}/.hydra-ensemble/secrets/anthropic.enc`
    fs.store.set(file, Buffer.from('enc:sk-ant-from-disk', 'utf8'))
    __setSecretsDeps({
      keytar: makeKeytar(), safeStorage: makeSafeStorage(), fs,
      path: fakePath, homedir: () => HOME
    })
    expect(await getApiKey()).toBe('sk-ant-from-disk')
  })

  it('returns null when both backends are empty', async () => {
    __setSecretsDeps({
      keytar: makeKeytar(), safeStorage: makeSafeStorage(), fs: makeFakeFs(),
      path: fakePath, homedir: () => HOME
    })
    expect(await getApiKey()).toBeNull()
  })
})

describe('clearApiKey', () => {
  it('removes from both keychain and disk', async () => {
    const keytar = makeKeytar()
    keytar.store.set('hydra-ensemble:anthropic-api-key', 'sk-ant-bye')
    const fs = makeFakeFs()
    const file = `${HOME}/.hydra-ensemble/secrets/anthropic.enc`
    fs.store.set(file, Buffer.from('enc:x', 'utf8'))

    __setSecretsDeps({
      keytar, safeStorage: makeSafeStorage(), fs,
      path: fakePath, homedir: () => HOME
    })

    await clearApiKey()
    expect(keytar.deletePassword).toHaveBeenCalledWith('hydra-ensemble', 'anthropic-api-key')
    expect(fs.store.has(file)).toBe(false)
  })
})

describe('testApiKey', () => {
  it('returns ok on a successful create()', async () => {
    const create = vi.fn(async () => ({ id: 'msg_x' }))
    const Ctor = vi.fn().mockImplementation(() => ({ messages: { create } }))
    __setSecretsDeps({ anthropic: Ctor as never })

    const res = await testApiKey('sk-ant-explicit')
    expect(res).toEqual({ ok: true })
    expect(Ctor).toHaveBeenCalledWith({ apiKey: 'sk-ant-explicit' })
    expect(create).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    })
  })

  it('returns "invalid key" when create() throws a 401', async () => {
    const create = vi.fn(async () => {
      const err = new Error('Unauthorized') as Error & { status: number }
      err.status = 401
      throw err
    })
    const Ctor = vi.fn().mockImplementation(() => ({ messages: { create } }))
    __setSecretsDeps({ anthropic: Ctor as never })

    const res = await testApiKey('sk-ant-bad')
    expect(res).toEqual({ ok: false, error: 'invalid key' })
  })

  it('returns a "network: <msg>" error on generic failure', async () => {
    const create = vi.fn(async () => { throw new Error('ECONNRESET') })
    const Ctor = vi.fn().mockImplementation(() => ({ messages: { create } }))
    __setSecretsDeps({ anthropic: Ctor as never })

    const res = await testApiKey('sk-ant-ok')
    expect(res).toEqual({ ok: false, error: 'network: ECONNRESET' })
  })
})

describe('redactedKey', () => {
  it('formats to sk-ant-****<last 4>', () => {
    expect(redactedKey('sk-ant-1234567890ABCD')).toBe('sk-ant-****ABCD')
    expect(redactedKey('abcd')).toBe('sk-ant-****abcd')
    expect(redactedKey('')).toBe('sk-ant-****')
  })
})
