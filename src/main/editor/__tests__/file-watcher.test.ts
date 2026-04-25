import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { FileWatcher, type FileChangedPayload, type FileDeletedPayload } from '../file-watcher'

// Each test allocates a sandbox dir under the OS tmp; we tear them down
// in afterEach to keep the suite reentrant.
const cleanupPaths: string[] = []

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const p = cleanupPaths.pop()
    if (!p) continue
    await rm(p, { recursive: true, force: true })
  }
})

async function tmpScratch(): Promise<string> {
  const path = join(tmpdir(), `file-watcher-${randomUUID()}`)
  await mkdir(path, { recursive: true })
  cleanupPaths.push(path)
  return path
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

describe('FileWatcher', () => {
  it('emits fileChanged with a hash that matches the new content', async () => {
    const root = await tmpScratch()
    const file = join(root, 'a.txt')
    await writeFile(file, 'first', 'utf-8')

    const watcher = new FileWatcher()
    const events: FileChangedPayload[] = []
    watcher.on('fileChanged', (p: FileChangedPayload) => events.push(p))
    watcher.subscribe(file)

    // Give chokidar a tick to wire up before mutating.
    await delay(150)
    const next = 'second-content'
    await writeFile(file, next, 'utf-8')

    const start = Date.now()
    while (events.length === 0 && Date.now() - start < 4000) {
      await delay(40)
    }

    expect(events.length).toBeGreaterThan(0)
    const evt = events[0]
    expect(evt?.path).toBe(file)
    expect(evt?.hash).toBe(sha1(next))
    expect(evt?.size).toBe(Buffer.byteLength(next, 'utf-8'))

    watcher.dispose()
  })

  it('refcounts subscriptions — events still fire after one unsubscribe', async () => {
    const root = await tmpScratch()
    const file = join(root, 'b.txt')
    await writeFile(file, 'one', 'utf-8')

    const watcher = new FileWatcher()
    const events: FileChangedPayload[] = []
    watcher.on('fileChanged', (p: FileChangedPayload) => events.push(p))
    // Two subscribers, then one unsubscribe — the watcher should still
    // be alive for the remaining holder.
    watcher.subscribe(file)
    watcher.subscribe(file)
    watcher.unsubscribe(file)

    await delay(150)
    await writeFile(file, 'two', 'utf-8')

    const start = Date.now()
    while (events.length === 0 && Date.now() - start < 4000) {
      await delay(40)
    }
    expect(events.length).toBeGreaterThan(0)

    watcher.dispose()
  })

  it('stops emitting after the last subscriber unsubscribes', async () => {
    const root = await tmpScratch()
    const file = join(root, 'c.txt')
    await writeFile(file, 'init', 'utf-8')

    const watcher = new FileWatcher()
    const events: FileChangedPayload[] = []
    watcher.on('fileChanged', (p: FileChangedPayload) => events.push(p))
    watcher.subscribe(file)
    await delay(150)
    watcher.unsubscribe(file)

    // Mutate after unsubscribing — no events should land.
    await writeFile(file, 'updated', 'utf-8')
    await delay(400)
    expect(events.length).toBe(0)

    watcher.dispose()
  })

  it('emits fileDeleted on unlink', async () => {
    const root = await tmpScratch()
    const file = join(root, 'd.txt')
    await writeFile(file, 'about to die', 'utf-8')

    const watcher = new FileWatcher()
    const deletes: FileDeletedPayload[] = []
    const changes: FileChangedPayload[] = []
    watcher.on('fileDeleted', (p: FileDeletedPayload) => deletes.push(p))
    watcher.on('fileChanged', (p: FileChangedPayload) => changes.push(p))
    watcher.subscribe(file)

    // Generous warmup: chokidar's awaitWriteFinish + the polling fallback
    // on Linux take a few hundred ms to settle on the underlying inode
    // before the first 'unlink' is recognised. Without this delay the
    // unlink can land BEFORE chokidar has registered the file and the
    // event is silently lost.
    await delay(400)
    await unlink(file)

    const start = Date.now()
    while (deletes.length === 0 && Date.now() - start < 8000) {
      await delay(50)
    }
    expect(deletes.length).toBeGreaterThan(0)
    expect(deletes[0]?.path).toBe(file)

    watcher.dispose()
  }, 12_000)
})
