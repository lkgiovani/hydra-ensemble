import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { WorktreeService } from '../worktree'

const tmpDirs: string[] = []

function gitAvailable(): boolean {
  try {
    const r = spawnSync('git', ['--version'], { stdio: 'ignore' })
    return r.status === 0
  } catch {
    return false
  }
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `hydra-ensemble-test-${randomUUID()}-`))
  tmpDirs.push(dir)
  // Init a fresh repo with a known initial branch.
  spawnSync('git', ['init', '-q', '-b', 'main', dir], { stdio: 'ignore' })
  // Local identity so the commit succeeds without global config.
  spawnSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' })
  spawnSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'ignore' })
  spawnSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false'], { stdio: 'ignore' })
  await writeFile(path.join(dir, 'README.md'), '# test\n', 'utf-8')
  spawnSync('git', ['-C', dir, 'add', 'README.md'], { stdio: 'ignore' })
  spawnSync('git', ['-C', dir, 'commit', '-q', '-m', 'init'], { stdio: 'ignore' })
  return dir
}

const skipIfNoGit = gitAvailable() ? describe : describe.skip

afterAll(async () => {
  for (const d of tmpDirs) {
    await rm(d, { recursive: true, force: true })
  }
})

skipIfNoGit('WorktreeService', () => {
  const svc = new WorktreeService()
  let repo = ''

  beforeAll(async () => {
    repo = await makeRepo()
  })

  it('repoRoot returns the init directory', async () => {
    const root = await svc.repoRoot(repo)
    expect(root).not.toBeNull()
    // realpath the expected dir to match git's symlink-resolved output.
    const { realpath } = await import('node:fs/promises')
    const expected = await realpath(repo)
    expect(root).toBe(expected)
  })

  it('createWorktree creates branch + worktree, listWorktrees marks it managed', async () => {
    const name = `feat-${randomUUID().slice(0, 8)}`
    const created = await svc.createWorktree(repo, name)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const list = await svc.listWorktrees(repo)
    expect(list.ok).toBe(true)
    if (!list.ok) return

    const managed = list.value.find((w) => w.branch === name)
    expect(managed).toBeDefined()
    expect(managed?.isManaged).toBe(true)
    expect(managed?.isMain).toBe(false)

    const main = list.value.find((w) => w.isMain)
    expect(main).toBeDefined()
    expect(main?.isManaged).toBe(false)
  })

  it('removeWorktree cleans both worktree and branch', async () => {
    const name = `temp-${randomUUID().slice(0, 8)}`
    const created = await svc.createWorktree(repo, name)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const removed = await svc.removeWorktree(repo, created.value.path)
    expect(removed.ok).toBe(true)

    const list = await svc.listWorktrees(repo)
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.value.find((w) => w.branch === name)).toBeUndefined()

    // Branch should also be gone.
    const branches = spawnSync('git', ['-C', repo, 'branch', '--list', name], {
      encoding: 'utf-8',
    })
    expect(branches.stdout.trim()).toBe('')
  })

  it('listChangedFiles reports an untracked file', async () => {
    const fname = `untracked-${randomUUID().slice(0, 8)}.txt`
    await writeFile(path.join(repo, fname), 'hello\n', 'utf-8')

    const changed = await svc.listChangedFiles(repo)
    expect(changed.ok).toBe(true)
    if (!changed.ok) return

    const found = changed.value.find((f) => f.path === fname)
    expect(found).toBeDefined()
    expect(found?.status).toBe('untracked')
  })

  it('currentBranch returns the checked-out branch', async () => {
    const branch = await svc.currentBranch(repo)
    expect(branch).toBe('main')
  })
})
