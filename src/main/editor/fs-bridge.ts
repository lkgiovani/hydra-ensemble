import { readFile, writeFile, readdir, stat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, sep } from 'node:path'
import type { DirEntry, FileContent } from '../../shared/types'

/** Maximum file size we will read into memory (5 MB). */
const MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * Filesystem bridge for the in-app editor. All paths must be absolute and
 * must resolve (via realpath) to a location inside the user's home directory.
 * This keeps the editor scoped to user files in v1; later we may broaden the
 * allowlist for paths the user explicitly opens via a system dialog.
 */
export class EditorFs {
  private readonly homeRoot: string

  constructor() {
    this.homeRoot = homedir()
  }

  async readFile(path: string): Promise<FileContent> {
    const safe = await this.assertSafe(path)
    const st = await stat(safe)
    if (st.isDirectory()) {
      throw new Error('path is a directory')
    }
    if (st.size > MAX_FILE_BYTES) {
      throw new Error(`file too large (${st.size} bytes; max ${MAX_FILE_BYTES})`)
    }
    const buf = await readFile(safe)
    if (this.looksUtf8(buf)) {
      return {
        path: safe,
        bytes: buf.toString('utf-8'),
        encoding: 'utf-8',
        size: st.size
      }
    }
    return {
      path: safe,
      bytes: buf.toString('base64'),
      encoding: 'base64',
      size: st.size
    }
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const safe = await this.assertSafe(path)
    const entries = await readdir(safe, { withFileTypes: true })
    const results: DirEntry[] = []
    for (const e of entries) {
      const child = join(safe, e.name)
      let st
      try {
        st = await stat(child)
      } catch {
        continue
      }
      results.push({
        name: e.name,
        path: child,
        isDir: st.isDirectory(),
        isSymlink: e.isSymbolicLink(),
        size: st.size,
        mtimeMs: st.mtimeMs
      })
    }
    results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return results
  }

  async writeFile(path: string, content: string): Promise<void> {
    const safe = await this.assertSafe(path, { allowMissing: true })
    await writeFile(safe, content, { encoding: 'utf-8' })
  }

  /**
   * Validate that a path is absolute and resolves to a location inside the
   * user's home directory. Returns the realpath (or the input if missing
   * and `allowMissing` is true, since writeFile may create new files).
   */
  private async assertSafe(
    path: string,
    opts: { allowMissing?: boolean } = {}
  ): Promise<string> {
    if (!isAbsolute(path)) {
      throw new Error(`path must be absolute: ${path}`)
    }
    let resolved: string
    try {
      resolved = await realpath(path)
    } catch (err) {
      if (opts.allowMissing) {
        resolved = path
      } else {
        throw err
      }
    }
    const homeNorm = this.homeRoot.endsWith(sep) ? this.homeRoot : this.homeRoot + sep
    if (resolved !== this.homeRoot && !resolved.startsWith(homeNorm)) {
      throw new Error(`path is outside the user home: ${resolved}`)
    }
    return resolved
  }

  /**
   * Heuristic: a buffer "looks UTF-8" if it has no NUL bytes and decodes
   * cleanly. This is good enough for distinguishing source files from
   * arbitrary binaries.
   */
  private looksUtf8(buf: Buffer): boolean {
    for (let i = 0; i < Math.min(buf.length, 8192); i++) {
      if (buf[i] === 0) return false
    }
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true })
      decoder.decode(buf)
      return true
    } catch {
      return false
    }
  }
}
