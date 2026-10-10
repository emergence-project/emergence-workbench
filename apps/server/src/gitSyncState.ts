import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

/** Read-only commands shared by the async home API and synchronous agent summary. */
export const syncCommands = {
  top: ['rev-parse', '--show-toplevel'],
  branch: ['rev-parse', '--abbrev-ref', 'HEAD'],
  upstream: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
  counts: ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
  status: ['status', '--porcelain=v1', '-z', '--untracked-files=no'],
  // Disable rename detection so both the old and new paths are checked.
  incoming: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '@{upstream}'],
  added: ['diff', '--name-only', '--no-renames', '--diff-filter=A', '-z', 'HEAD', '@{upstream}'],
  untracked: ['ls-files', '--others', '--exclude-standard', '-z'],
} satisfies Record<string, string[]>

const paths = (raw: string) => raw.split('\0').filter(Boolean)

/** -z porcelain has an extra source path for renames/copies, not another dirty entry. */
export function workingChanges(raw: string): { dirty: number; paths: Set<string> } {
  const entries = paths(raw)
  const changed = new Set<string>()
  let dirty = 0
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    dirty++
    changed.add(entry.slice(3))
    if (/[RC]/.test(entry.slice(0, 2))) changed.add(entries[++i]!)
  }
  return { dirty, paths: changed }
}

export function syncChanges(status: string, incoming = '', added = '', untracked = '') {
  const local = workingChanges(status)
  const remotePaths = new Set(paths(incoming))
  const addedPaths = new Set(paths(added))
  const conflicts = [...new Set([
    ...[...local.paths].filter((p) => remotePaths.has(p)),
    ...paths(untracked).filter((p) => addedPaths.has(p)),
  ])].sort()
  return { dirty: local.dirty, conflicts: conflicts.slice(0, 20), conflictCount: conflicts.length }
}

/** No fetch: consult the last received refs. Not a repository root or any git failure -> skip. */
export function localSyncState(root: string) {
  const git = (args: string[]) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 1_500, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  try {
    if (fs.realpathSync.native(git(syncCommands.top).trim()) !== fs.realpathSync.native(root)) return null
    git(syncCommands.upstream)
    const [ahead, behind] = git(syncCommands.counts).trim().split(/\s+/).map(Number) as [number, number]
    if (!ahead && !behind) return { ahead, behind, conflicts: [], conflictCount: 0, fetchedAt: null }
    const changes = behind > 0
      ? syncChanges(git(syncCommands.status), git(syncCommands.incoming), git(syncCommands.added), git(syncCommands.untracked))
      : syncChanges('')
    let fetchedAt: Date | null = null
    try {
      const file = git(['rev-parse', '--path-format=absolute', '--git-path', 'FETCH_HEAD']).trim()
      fetchedAt = fs.statSync(file).mtime
    } catch { /* no FETCH_HEAD yet */ }
    return { ahead, behind, ...changes, fetchedAt }
  } catch { return null }
}
